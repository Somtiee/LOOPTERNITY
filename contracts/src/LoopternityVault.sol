// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {euint256, ebool, e, inco} from "@inco/lightning/src/Lib.sol";
import {Ownable, Pausable, ReentrancyGuard} from "./auth/Access.sol";

/**
 * @title LoopternityVault
 * @notice P2E vault for LOOPTERNITY on Base. Entry fees fund a weekly pool.
 *         Scores are Inco Lightning ciphertexts (client: lightning-js euint256).
 *
 * Hybrid A ranking cannot be computed in the EVM without a TEE decrypt.
 * After week end, owner/keeper decrypts allowed handles off-chain, computes
 *   weeklyScore = (survivalMs/1000)*(multiplierHundredths/100) + activityBonus(runCount)
 * (runCount is public), then `attestTop10` + `settleWeek`. Do not trust browsers.
 *
 * Settlement: 80% of the week's fees to Top 10 (bps of that 80%):
 *   3000, 1800, 1200, 900, 800, 700, 600, 400, 300, 300
 * 20% to `treasury`. Players pull via `claim`. Unused top-10 bps and empty
 * weeks accrue to treasury. Fee is wei only — never a hardcoded USD amount.
 */
contract LoopternityVault is Ownable, Pausable, ReentrancyGuard {
    using e for euint256;
    using e for ebool;
    using e for uint256;
    using e for bytes;
    using e for address;

    uint256 public constant PRIZE_POOL_BPS = 8000;
    uint256 public constant TREASURY_BPS = 2000;
    uint16[10] public top10SharesBps;

    uint256 public entryFeeWei;
    address public treasury;
    address public keeper;

    struct Week {
        bool themeSealed;
        bool rankingAttested;
        bool settled;
        uint256 poolWei;
        uint256 treasuryAccruedWei;
        euint256 encryptedTheme;
        address[10] top10;
    }

    mapping(bytes32 => Week) private _weeks;
    mapping(bytes32 => mapping(address => uint256)) public unusedEntries;
    mapping(bytes32 => mapping(address => uint256)) public runCount;
    mapping(bytes32 => mapping(address => bool)) public hasScore;
    mapping(bytes32 => mapping(address => euint256)) private _bestSurvivalMs;
    mapping(bytes32 => mapping(address => euint256)) private _bestMultiplier;
    mapping(bytes32 => mapping(address => uint256)) public claimable;

    event RunEntered(address indexed player, string weekId, uint256 value);
    event ScoreSubmitted(address indexed player, string weekId, uint256 runCount);
    event ThemeSealed(string weekId, address indexed sealer);
    event Top10Attested(string weekId, address indexed attester);
    event WeekSettled(string weekId, uint256 prizeWei, uint256 treasuryWei);
    event Claimed(address indexed player, string weekId, uint256 amount);
    event EntryFeeUpdated(uint256 feeWei);
    event TreasuryUpdated(address indexed treasury);
    event KeeperUpdated(address indexed keeper);

    error InvalidFee();
    error InvalidTreasury();
    error WrongWeek();
    error Underpaid();
    error NoEntry();
    error ThemeAlreadySealed();
    error WeekNotEnded();
    error AlreadySettled();
    error RankingNotAttested();
    error AlreadyAttested();
    error NothingToClaim();
    error TransferFailed();
    error BadWeekId();

    modifier onlyOwnerOrKeeper() {
        if (msg.sender != owner && msg.sender != keeper) {
            revert OwnableUnauthorizedAccount(msg.sender);
        }
        _;
    }

    constructor(uint256 entryFeeWei_, address treasury_) Ownable(msg.sender) {
        if (entryFeeWei_ == 0) revert InvalidFee();
        if (treasury_ == address(0)) revert InvalidTreasury();
        entryFeeWei = entryFeeWei_;
        treasury = treasury_;
        keeper = msg.sender;
        top10SharesBps = [3000, 1800, 1200, 900, 800, 700, 600, 400, 300, 300];
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function setEntryFeeWei(uint256 feeWei) external onlyOwner {
        if (feeWei == 0) revert InvalidFee();
        entryFeeWei = feeWei;
        emit EntryFeeUpdated(feeWei);
    }

    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert InvalidTreasury();
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    function setKeeper(address keeper_) external onlyOwner {
        keeper = keeper_;
        emit KeeperUpdated(keeper_);
    }

    /// @notice Sunday 00:00 UTC as `YYYY-MM-DD`. Same format as `src/web3/p2e/week.ts`.
    function currentWeekId() public view returns (string memory) {
        return weekIdAt(block.timestamp);
    }

    function weekIdAt(uint256 timestamp) public pure returns (string memory) {
        uint256 start = _weekStart(timestamp);
        (uint256 y, uint256 m, uint256 d) = _daysToDate(start / 1 days);
        return string.concat(_pad4(y), "-", _pad2(m), "-", _pad2(d));
    }

    function weekPoolWei(string calldata weekId) external view returns (uint256) {
        return _weeks[_id(weekId)].poolWei;
    }

    function weekSettled(string calldata weekId) external view returns (bool) {
        return _weeks[_id(weekId)].settled;
    }

    function themeSealed(string calldata weekId) external view returns (bool) {
        return _weeks[_id(weekId)].themeSealed;
    }

    function bestSurvivalHandle(string calldata weekId, address player) external view returns (bytes32) {
        return euint256.unwrap(_bestSurvivalMs[_id(weekId)][player]);
    }

    function bestMultiplierHandle(string calldata weekId, address player) external view returns (bytes32) {
        return euint256.unwrap(_bestMultiplier[_id(weekId)][player]);
    }

    function getTop10(string calldata weekId) external view returns (address[10] memory) {
        return _weeks[_id(weekId)].top10;
    }

    /// @notice Pay `entryFeeWei` (or more) to get one unused submit ticket for this week.
    function enterRun(string calldata weekId) external payable whenNotPaused nonReentrant {
        _requireCurrentWeek(weekId);
        if (msg.value < entryFeeWei) revert Underpaid();
        bytes32 id = _id(weekId);
        unusedEntries[id][msg.sender] += 1;
        _weeks[id].poolWei += msg.value;
        emit RunEntered(msg.sender, weekId, msg.value);
    }

    /**
     * @notice Consume one paid ticket and store Inco-encrypted survival ms + multiplier
     *         (hundredths). Pays Inco Lightning input fees: `inco.getFee() * 2`.
     *         Does not store plaintext scores.
     */
    function submitConfidentialScore(
        bytes calldata encryptedSurvivalMs,
        bytes calldata encryptedMultiplier
    ) external payable whenNotPaused nonReentrant {
        string memory weekId = currentWeekId();
        bytes32 id = _id(weekId);
        uint256 tickets = unusedEntries[id][msg.sender];
        if (tickets == 0) revert NoEntry();
        unusedEntries[id][msg.sender] = tickets - 1;

        euint256 survival = encryptedSurvivalMs.newEuint256(msg.sender);
        euint256 multiplier = encryptedMultiplier.newEuint256(msg.sender);
        _allowScore(survival);
        _allowScore(multiplier);

        euint256 skill = survival.mul(multiplier).div(uint256(100000).asEuint256());
        skill.allowThis();

        if (!hasScore[id][msg.sender]) {
            _bestSurvivalMs[id][msg.sender] = survival;
            _bestMultiplier[id][msg.sender] = multiplier;
            hasScore[id][msg.sender] = true;
        } else {
            euint256 prevSkill = _bestSurvivalMs[id][msg.sender].mul(_bestMultiplier[id][msg.sender]).div(
                uint256(100000).asEuint256()
            );
            ebool better = skill.gt(prevSkill);
            _bestSurvivalMs[id][msg.sender] = better.select(survival, _bestSurvivalMs[id][msg.sender]);
            _bestMultiplier[id][msg.sender] = better.select(multiplier, _bestMultiplier[id][msg.sender]);
            _allowScore(_bestSurvivalMs[id][msg.sender]);
            _allowScore(_bestMultiplier[id][msg.sender]);
        }

        runCount[id][msg.sender] += 1;
        emit ScoreSubmitted(msg.sender, weekId, runCount[id][msg.sender]);
    }

    /// @notice Owner/keeper Sunday seal. Players cannot choose the P2E theme.
    ///         Ciphertext is euint256 theme index: 0 volcanic, 1 planetary, 2 antarctica
    ///         (`sealedThemeForWeek` / `themeIndex` in `src/web3/p2e/week.ts`).
    ///         Clients treat `themeSealed` as the public reveal; they must not pick a world.
    function sealWeeklyTheme(string calldata weekId, bytes calldata encryptedTheme)
        external
        payable
        onlyOwnerOrKeeper
    {
        _requireCurrentWeek(weekId);
        bytes32 id = _id(weekId);
        Week storage w = _weeks[id];
        if (w.themeSealed) revert ThemeAlreadySealed();
        euint256 theme = encryptedTheme.newEuint256(msg.sender);
        theme.allowThis();
        theme.allow(owner);
        theme.allow(keeper);
        w.encryptedTheme = theme;
        w.themeSealed = true;
        emit ThemeSealed(weekId, msg.sender);
    }

    /**
     * @notice Official Top 10 for `weekId` after decrypting Inco handles off-chain.
     *         Unused slots are address(0). May be called once per week, after week end.
     */
    function attestTop10(string calldata weekId, address[10] calldata ranked)
        external
        onlyOwnerOrKeeper
    {
        bytes32 id = _id(weekId);
        Week storage w = _weeks[id];
        if (w.settled) revert AlreadySettled();
        if (w.rankingAttested) revert AlreadyAttested();
        if (_weekStart(block.timestamp) <= _parseWeekStart(weekId)) revert WeekNotEnded();
        w.top10 = ranked;
        w.rankingAttested = true;
        emit Top10Attested(weekId, msg.sender);
    }

    /**
     * @notice After week end and `attestTop10`. 80% of `poolWei` is the prize;
     *         20% goes to `treasury` immediately. Each Top 10 slot gets
     *         `top10SharesBps[i]` of that 80%. `address(0)` slots and leftover
     *         wei from rounding accrue to treasury — the split is not changed.
     *         Reverts if already settled or the week has not ended.
     *         Winners pull via `claim(weekId)`.
     */
    function settleWeek(string calldata weekId) external onlyOwnerOrKeeper nonReentrant {
        bytes32 id = _id(weekId);
        Week storage w = _weeks[id];
        if (w.settled) revert AlreadySettled();
        if (_weekStart(block.timestamp) <= _parseWeekStart(weekId)) revert WeekNotEnded();
        if (!w.rankingAttested) revert RankingNotAttested();

        uint256 pool = w.poolWei;
        uint256 prize = (pool * PRIZE_POOL_BPS) / 10_000;
        uint256 treasuryCut = pool - prize;
        uint256 allocated;

        for (uint256 i = 0; i < 10; i++) {
            address player = w.top10[i];
            if (player == address(0)) continue;
            uint256 share = (prize * uint256(top10SharesBps[i])) / 10_000;
            claimable[id][player] += share;
            allocated += share;
        }

        treasuryCut += (prize - allocated);
        w.treasuryAccruedWei = treasuryCut;
        w.settled = true;
        emit WeekSettled(weekId, allocated, treasuryCut);

        if (treasuryCut > 0) {
            _pay(treasury, treasuryCut);
        }
    }

    function claim(string calldata weekId) external nonReentrant {
        bytes32 id = _id(weekId);
        uint256 amount = claimable[id][msg.sender];
        if (amount == 0) revert NothingToClaim();
        claimable[id][msg.sender] = 0;
        emit Claimed(msg.sender, weekId, amount);
        _pay(msg.sender, amount);
    }

    function _allowScore(euint256 handle) internal {
        handle.allowThis();
        handle.allow(msg.sender);
        handle.allow(owner);
        handle.allow(keeper);
    }

    function _pay(address to, uint256 amount) internal {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    function _id(string memory weekId) internal pure returns (bytes32) {
        return keccak256(bytes(weekId));
    }

    function _requireCurrentWeek(string memory weekId) internal view {
        if (keccak256(bytes(weekId)) != keccak256(bytes(currentWeekId()))) revert WrongWeek();
        _parseWeekStart(weekId);
    }

    function _weekStart(uint256 timestamp) internal pure returns (uint256) {
        uint256 daysSinceEpoch = timestamp / 1 days;
        uint256 dow = (daysSinceEpoch + 4) % 7;
        if (daysSinceEpoch < dow) return 0;
        return (daysSinceEpoch - dow) * 1 days;
    }

    function _parseWeekStart(string memory weekId) internal pure returns (uint256 sundayTs) {
        bytes memory b = bytes(weekId);
        if (b.length != 10 || b[4] != "-" || b[7] != "-") revert BadWeekId();
        uint256 y = _dec4(b, 0);
        uint256 m = _dec2(b, 5);
        uint256 d = _dec2(b, 8);
        sundayTs = _daysFromDate(y, m, d) * 1 days;
        if (_weekStart(sundayTs) != sundayTs) revert BadWeekId();
    }

    function _dec2(bytes memory b, uint256 i) internal pure returns (uint256) {
        uint256 a = uint8(b[i]);
        uint256 c = uint8(b[i + 1]);
        if (a < 48 || a > 57 || c < 48 || c > 57) revert BadWeekId();
        return (a - 48) * 10 + (c - 48);
    }

    function _dec4(bytes memory b, uint256 i) internal pure returns (uint256) {
        return _dec2(b, i) * 100 + _dec2(b, i + 2);
    }

    function _pad2(uint256 n) internal pure returns (string memory) {
        bytes memory s = new bytes(2);
        s[0] = bytes1(uint8(48 + n / 10));
        s[1] = bytes1(uint8(48 + n % 10));
        return string(s);
    }

    function _pad4(uint256 n) internal pure returns (string memory) {
        bytes memory s = new bytes(4);
        s[0] = bytes1(uint8(48 + n / 1000));
        s[1] = bytes1(uint8(48 + (n / 100) % 10));
        s[2] = bytes1(uint8(48 + (n / 10) % 10));
        s[3] = bytes1(uint8(48 + n % 10));
        return string(s);
    }

    function _daysToDate(uint256 _days) internal pure returns (uint256 year, uint256 month, uint256 day) {
        int256 L = int256(_days) + 68569 + 2440588;
        int256 N = (4 * L) / 146097;
        L = L - (146097 * N + 3) / 4;
        int256 _year = (4000 * (L + 1)) / 1461001;
        L = L - (1461 * _year) / 4 + 31;
        int256 _month = (80 * L) / 2447;
        int256 _day = L - (2447 * _month) / 80;
        L = _month / 11;
        _month = _month + 2 - 12 * L;
        _year = 100 * (N - 49) + _year + L;
        year = uint256(_year);
        month = uint256(_month);
        day = uint256(_day);
    }

    function _daysFromDate(uint256 year, uint256 month, uint256 day) internal pure returns (uint256) {
        int256 _year = int256(year);
        int256 _month = int256(month);
        int256 _day = int256(day);
        int256 __days = _day - 32075 + (1461 * (_year + 4800 + (_month - 14) / 12)) / 4
            + (367 * (_month - 2 - ((_month - 14) / 12) * 12)) / 12
            - (3 * ((_year + 4900 + (_month - 14) / 12) / 100)) / 4 - 2440588;
        return uint256(__days);
    }
}

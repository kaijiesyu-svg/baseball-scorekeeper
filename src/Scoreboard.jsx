import React, { useReducer } from 'react';

// 0. 隨機打序產生器 (台灣棒球選手姓名庫)
const PLAYER_NAMES = [
  "陳金鋒", "彭政閔", "林智勝", "張泰山", "王建民", "郭泓志", "陽岱鋼", "胡金龍", "林哲瑄", "高國輝", 
  "周思齊", "林益全", "江坤宇", "王威晨", "朱育賢", "陳傑憲", "蘇智傑", "林安可"
];

// 0.1 板凳球員名單
const BENCH_NAMES = ["林泓育", "陳鏞基", "郭嚴文", "林立", "陳晨威", "高宇杰", "岳東華"];
const generateBench = () => BENCH_NAMES.map((name) => ({
  name,
  number: Math.floor(Math.random() * 99) + 1
}));

const generateLineup = (size = 9) => {
  const shuffled = [...PLAYER_NAMES].sort(() => 0.5 - Math.random());
  return Array.from({ length: size }).map((_, i) => ({
    id: `player-${i}-${Math.random().toString(36).substr(2, 9)}`,
    order: i + 1,
    name: shuffled[i] || `打者${i + 1}`,
    number: Math.floor(Math.random() * 99) + 1
  }));
};

// 1. 定義初始狀態
const initialState = {
  outs: 0,
  inning: 1,
  isTopInning: true, // true = 上半局 (客隊), false = 下半局 (主隊)
  guestScore: 0,
  homeScore: 0,
  bases: [null, null, null], // [一壘, 二壘, 三壘] 存放跑者姓名或 null
  guestInningScores: [], // 各局得分
  homeInningScores: [],
  guestHits: 0,
  homeHits: 0,
  guestErrors: 0,
  homeErrors: 0,
  guestLOB: 0, // 殘壘 (Left On Base)
  homeLOB: 0,
  lineup: generateLineup(), // 主隊打序
  bench: generateBench(), // 板凳球員
  currentBatter: 0, // 當前打者索引 (0-8)
  history: [], // 打擊紀錄
  pastStates: [], // 歷史狀態 (用於 Undo)
  futureStates: [], // 未來狀態 (用於 Redo/Replay)
  selectedBase: null, // 當前選取的壘包索引 (0=1B, 1=2B, 2=3B)
  userTeam: 'HOME', // 'HOME' | 'GUEST'
  gameStarted: false,
  totalInnings: 7, // 預設比賽局數
  userTeamName: '主隊',
  opponentTeamName: '客隊',
  isLineupConfirmed: false,
};

// 2. 定義 Action Types (避免打錯字)
const ACTIONS = {
  START_GAME: 'START_GAME',
  LOAD_GAME: 'LOAD_GAME', // 匯入比賽
  CONFIRM_LINEUP: 'CONFIRM_LINEUP',
  REDO: 'REDO', // 重做 (下一步)
  JUMP_TO_START: 'JUMP_TO_START', // 回到開始
  JUMP_TO_END: 'JUMP_TO_END', // 到最後
  ADD_PLAYER: 'ADD_PLAYER',
  REMOVE_PLAYER: 'REMOVE_PLAYER',
  MOVE_PLAYER: 'MOVE_PLAYER',
  UPDATE_PLAYER: 'UPDATE_PLAYER',
  STRIKEOUT: 'STRIKEOUT',
  ADD_OUT: 'ADD_OUT',
  SELECT_BASE: 'SELECT_BASE', // 選取壘包
  MOVE_RUNNER: 'MOVE_RUNNER', // 移動跑者
  UNDO: 'UNDO', // 回到上一動
  ADD_SCORE: 'ADD_SCORE',
  SUB_SCORE: 'SUB_SCORE', // 手動扣分
  HIT_SINGLE: 'HIT_SINGLE',
  HIT_DOUBLE: 'HIT_DOUBLE',
  HIT_TRIPLE: 'HIT_TRIPLE',
  HIT_HR: 'HIT_HR',
  WALK: 'WALK', // 四壞保送
  REACH_ON_ERROR: 'REACH_ON_ERROR', // 失誤上壘
  SACRIFICE: 'SACRIFICE', // 高飛犧牲/推進 (解決手動得分沒打點的問題)
  SUBSTITUTE: 'SUBSTITUTE', // 代打
  TOGGLE_BASE: 'TOGGLE_BASE', // 手動切換壘包狀態
  ADD_ERROR: 'ADD_ERROR',
  RESET_COUNT: 'RESET_COUNT', // 重置球數 (下一位打者)
  RESET_GAME: 'RESET_GAME',
};

// 判斷是否為使用者球隊進攻
function isUserBatting(state) {
  return (state.isTopInning && state.userTeam === 'GUEST') || (!state.isTopInning && state.userTeam === 'HOME');
}

// 3. Reducer 函數：處理棒球規則的核心邏輯
// 包裝一層 Reducer 來處理 Undo 邏輯
function scoreReducer(state, action) {
  // 處理 Undo
  if (action.type === ACTIONS.UNDO) {
    if (state.pastStates.length === 0) return state;
    
    const previous = state.pastStates[0];
    const newPast = state.pastStates.slice(1);
    
    // 將當前狀態存入 futureStates (為了 Redo)
    const { pastStates, futureStates, ...currentStateSnapshot } = state;
    
    return { 
      ...previous, 
      pastStates: newPast,
      futureStates: [currentStateSnapshot, ...(state.futureStates || [])]
    };
  }

  // 處理 Redo (下一步)
  if (action.type === ACTIONS.REDO) {
    if (!state.futureStates || state.futureStates.length === 0) return state;

    const next = state.futureStates[0];
    const newFuture = state.futureStates.slice(1);

    // 將當前狀態存入 pastStates
    const { pastStates, futureStates, ...currentStateSnapshot } = state;

    return {
      ...next,
      pastStates: [currentStateSnapshot, ...state.pastStates],
      futureStates: newFuture
    };
  }

  // 處理 Load Game (直接替換整個 state，包含歷史紀錄)
  if (action.type === ACTIONS.LOAD_GAME) {
    return { ...action.payload, futureStates: [] };
  }

  // 處理回到開始 (Jump to Start)
  if (action.type === ACTIONS.JUMP_TO_START) {
    if (state.pastStates.length === 0) return state;
    // 這裡為了簡化，我們利用遞迴呼叫 UNDO 直到盡頭，或者直接取最舊的狀態
    // 為了效能，我們直接操作陣列
    return jumpToStart(state);
  }

  // 執行正常的遊戲邏輯
  const nextState = gameLogicReducer(state, action);

  // 如果狀態沒有改變，直接回傳
  if (nextState === state) return state;

  // 將舊狀態存入 pastStates，並清空 futureStates (因為產生了新分支)
  const { pastStates, futureStates, ...currentStateSnapshot } = state;
  return { 
    ...nextState, 
    pastStates: [currentStateSnapshot, ...pastStates], // 移除 slice 限制以支援完整重播
    futureStates: [] 
  };
}

// 輔助函數：一次跳轉到最初狀態
function jumpToStart(state) {
  // 1. 找出「比賽開始」的那一刻 (gameStarted === true 的最舊狀態)
  // pastStates 是 [最新, ..., 最舊]
  let targetIndex = -1;
  for (let i = state.pastStates.length - 1; i >= 0; i--) {
    if (state.pastStates[i].gameStarted) {
      targetIndex = i;
      break;
    }
  }

  // 如果找不到 (代表所有過去狀態都是未開賽，或者沒有過去狀態)，則不動作
  if (targetIndex === -1) {
    return state;
  }

  const targetState = state.pastStates[targetIndex];
  
  // 2. 準備移動到 Future 的狀態
  // 這些是 targetIndex 之前的狀態 (比 targetState 新的狀態)
  const historyToMove = state.pastStates.slice(0, targetIndex);
  
  // 反轉順序，變成 [最舊+1, ..., 最新]
  const reorderedHistory = historyToMove.reverse();
  
  // 3. 構建新的 Future
  const { pastStates, futureStates, ...currentStateSnapshot } = state;
  const newFuture = [
    ...reorderedHistory, 
    currentStateSnapshot, 
    ...(state.futureStates || [])
  ];

  // 4. 構建新的 Past (保留比 targetState 更舊的狀態，例如 Setup 畫面)
  const newPast = state.pastStates.slice(targetIndex + 1);

  return {
    ...targetState,
    pastStates: newPast,
    futureStates: newFuture
  };
}

function gameLogicReducer(state, action) {
  switch (action.type) {
    case ACTIONS.START_GAME:
      return { 
        ...state, 
        gameStarted: true, 
        userTeam: action.payload.userTeam,
        userTeamName: action.payload.userTeamName,
        opponentTeamName: action.payload.opponentTeamName,
        lineup: generateLineup(action.payload.lineupSize),
        totalInnings: action.payload.totalInnings
      };

    case ACTIONS.CONFIRM_LINEUP:
      return { ...state, isLineupConfirmed: true };

    case ACTIONS.ADD_PLAYER:
      const nextOrder = state.lineup.length + 1;
      const newPlayer = {
        id: `player-${nextOrder}-${Math.random().toString(36).substr(2, 9)}`,
        order: nextOrder,
        name: `打者${nextOrder}`,
        number: Math.floor(Math.random() * 99) + 1
      };
      return { ...state, lineup: [...state.lineup, newPlayer] };

    case ACTIONS.REMOVE_PLAYER:
      if (state.lineup.length <= 9) return state; // 至少保留 9 人
      const lineupReduced = state.lineup.slice(0, -1);
      return { ...state, lineup: lineupReduced };

    case ACTIONS.MOVE_PLAYER:
      const { fromIndex, toIndex } = action.payload;
      const lineupMove = [...state.lineup];
      const [movedPlayer] = lineupMove.splice(fromIndex, 1);
      lineupMove.splice(toIndex, 0, movedPlayer);
      lineupMove.forEach((p, i) => p.order = i + 1);
      return { ...state, lineup: lineupMove };

    case ACTIONS.UPDATE_PLAYER:
      const { index, field, value } = action.payload;
      const lineupUpdate = [...state.lineup];
      lineupUpdate[index] = { ...lineupUpdate[index], [field]: value };
      return { ...state, lineup: lineupUpdate };

    case ACTIONS.STRIKEOUT:
      return handleOut(state, '三振');

    case ACTIONS.ADD_OUT:
      // 特殊處理：如果有選取跑者，視為牽制/夾殺出局
      if (state.selectedBase !== null) {
        const outBase = state.selectedBase;
        const runner = state.bases[outBase];
        const newBasesOut = [...state.bases];
        newBasesOut[outBase] = null;
        
        return handleOut({
          ...state,
          bases: newBasesOut,
          selectedBase: null
        }, '跑壘出局', runner);
      }
      return handleOut(state, '出局');

    case ACTIONS.ADD_SCORE:
      // 手動加分 (例如暴投得分)
      const addState = addScore(state, 1);
      // 紀錄手動得分到歷史
      if (isUserBatting(state)) {
        return {
          ...addState,
          history: [{ inning: state.inning, batter: '手動調整', result: '得分(+1)', rbi: 0, scorers: [] }, ...state.history]
        };
      }
      return addState;

    case ACTIONS.SUB_SCORE:
      const subState = addScore(state, -1);
      if (isUserBatting(state)) {
        return {
          ...subState,
          history: [{ inning: state.inning, batter: '手動調整', result: '扣分(-1)', rbi: 0, scorers: [] }, ...state.history]
        };
      }
      return subState;

    case ACTIONS.HIT_SINGLE:
      return handleHit(state, 1);
    
    case ACTIONS.HIT_DOUBLE:
      return handleHit(state, 2);

    case ACTIONS.HIT_TRIPLE:
      return handleHit(state, 3);

    case ACTIONS.HIT_HR:
      return handleHit(state, 4);

    case ACTIONS.WALK:
      return handleWalk(state);

    case ACTIONS.REACH_ON_ERROR:
      return handleReachOnError(state);

    case ACTIONS.SACRIFICE:
      return handleSacrifice(state);

    case ACTIONS.SUBSTITUTE:
      const benchIndex = action.payload;
      const newBench = [...state.bench];
      const newLineup = [...state.lineup];
      const playerIn = newBench[benchIndex];
      const playerOut = newLineup[state.currentBatter];

      // 交換球員 (或直接替換，舊球員下放板凳)
      newBench.splice(benchIndex, 1); // 移除板凳球員
      newBench.push(playerOut); // 舊打者放入板凳 (可選)
      
      // 更新打序中的球員，保留原本的棒次 order
      newLineup[state.currentBatter] = { ...playerIn, order: playerOut.order };
      const substitutionState = { ...state, lineup: newLineup, bench: newBench };

      // 紀錄歷史 (只記主隊)
      if (isUserBatting(state)) {
        return {
          ...substitutionState,
          history: [{
            inning: state.inning,
            batter: playerIn.name,
            result: `代打 (原:${playerOut.name})`,
            rbi: 0,
            scorers: []
          }, ...state.history]
        };
      }
      return substitutionState;

    case ACTIONS.SELECT_BASE:
      if (state.selectedBase === action.payload) {
        return { ...state, selectedBase: null }; // 取消選取
      }
      return { ...state, selectedBase: action.payload };

    case ACTIONS.MOVE_RUNNER:
      const fromBase = state.selectedBase;
      const toBase = action.payload;
      if (fromBase === null) return state;
      
      const runner = state.bases[fromBase];
      const newBasesMove = [...state.bases];
      
      // 移動到本壘 (得分)
      if (toBase === 3) {
        newBasesMove[fromBase] = null;
        let moveState = addScore({ ...state, bases: newBasesMove, selectedBase: null }, 1);
        // 紀錄歷史
        if (isUserBatting(state)) {
             moveState.history = [{
              inning: state.inning,
              batter: runner,
              result: '跑壘得分',
              rbi: 0,
              scorers: [runner]
            }, ...moveState.history];
        }
        return moveState;
      }

      // 移動到其他壘包 (若有人則不允許移動，避免誤刪)
      if (newBasesMove[toBase]) {
        return { ...state, selectedBase: null }; 
      }

      newBasesMove[fromBase] = null;
      newBasesMove[toBase] = runner;
      return { ...state, bases: newBasesMove, selectedBase: null };

    case ACTIONS.TOGGLE_BASE:
      const toggledBases = [...state.bases];
      toggledBases[action.payload] = toggledBases[action.payload] ? null : '跑者';
      return { ...state, bases: toggledBases };

    case ACTIONS.ADD_ERROR:
      // 失誤是記在「防守方」
      if (state.isTopInning) {
        return { ...state, homeErrors: state.homeErrors + 1 }; // 客隊打擊，主隊防守失誤
      } else {
        return { ...state, guestErrors: state.guestErrors + 1 }; // 主隊打擊，客隊防守失誤
      }

    case ACTIONS.RESET_COUNT:
      return { ...state, currentBatter: getNextBatterIndex(state) };

    case ACTIONS.RESET_GAME:
      return initialState;

    default:
      return state;
  }
}

// 輔助函數：取得下一位打者的索引
function getNextBatterIndex(state) {
  // 只有在使用者球隊進攻時，打序才往下跳
  if (isUserBatting(state)) {
    return (state.currentBatter + 1) % 9;
  }
  return state.currentBatter;
}

// 輔助函數：處理得分 (更新總分與局分)
function addScore(state, runs) {
  if (runs === 0) return state;

  const currentInningIndex = state.inning - 1;
  if (state.isTopInning) {
    const newScores = [...state.guestInningScores];
    while (newScores.length <= currentInningIndex) newScores.push(0);
    
    const currentScore = newScores[currentInningIndex] || 0;
    // 確保不扣到負數
    const actualRuns = (runs < 0 && currentScore + runs < 0) ? -currentScore : runs;

    newScores[currentInningIndex] = currentScore + actualRuns;
    return { ...state, guestScore: state.guestScore + actualRuns, guestInningScores: newScores };
  } else {
    const newScores = [...state.homeInningScores];
    while (newScores.length <= currentInningIndex) newScores.push(0);

    const currentScore = newScores[currentInningIndex] || 0;
    const actualRuns = (runs < 0 && currentScore + runs < 0) ? -currentScore : runs;

    newScores[currentInningIndex] = currentScore + actualRuns;
    return { ...state, homeScore: state.homeScore + actualRuns, homeInningScores: newScores };
  }
}

// 輔助函數：處理安打進壘邏輯 (Station-to-Station)
function handleHit(state, basesHit) {
  const batterName = state.lineup[state.currentBatter].name;
  let scorers = [];
  let newBases = [...state.bases]; // [1B, 2B, 3B]
  const nextBatter = getNextBatterIndex(state);
  const hitNames = { 1: '一安', 2: '二安', 3: '三安', 4: '全壘打' };

  // 根據安打類型移動跑者
  if (basesHit === 4) { // 全壘打
    scorers = [...newBases.filter(b => b), batterName];
    newBases = [null, null, null];
  } else if (basesHit === 3) { // 三壘安打
    scorers = newBases.filter(b => b); // 壘上全回來
    newBases = [null, null, batterName]; // 打者上三壘
  } else if (basesHit === 2) { // 二壘安打
    if (newBases[2]) scorers.push(newBases[2]);
    if (newBases[1]) scorers.push(newBases[1]);
    newBases = [null, batterName, newBases[0]]; // 一壘跑者上三壘，打者上二壘
  } else { // 一壘安打
    if (newBases[2]) scorers.push(newBases[2]);
    newBases = [batterName, newBases[0], newBases[1]]; // 推進一個壘包
  }

  // 更新安打數
  const hitState = state.isTopInning 
    ? { ...state, guestHits: state.guestHits + 1 } 
    : { ...state, homeHits: state.homeHits + 1 };
  
  const runs = scorers.length;

  // 重置球數並加分
  const newState = addScore({
    ...hitState,
    bases: newBases,
    currentBatter: nextBatter
  }, runs);

  // 紀錄歷史 (只記主隊)
  if (isUserBatting(state)) {
    newState.history = [{
      inning: state.inning,
      batter: state.lineup[state.currentBatter].name,
      result: hitNames[basesHit],
      rbi: runs,
      scorers: scorers
    }, ...state.history];
  }

  return newState;
}

// 輔助函數：處理失誤上壘 (Reach on Error)
function handleReachOnError(state) {
  // 1. 計算失誤 (防守方)
  const errorState = state.isTopInning
    ? { ...state, homeErrors: state.homeErrors + 1 }
    : { ...state, guestErrors: state.guestErrors + 1 };
  const batterName = state.lineup[state.currentBatter].name;
  const nextBatter = getNextBatterIndex(state);

  // 2. 跑壘邏輯 (比照一壘安打：推進一個壘包)
  let newBases = [...state.bases];
  let scorers = newBases[2] ? [newBases[2]] : [];
  newBases = [batterName, newBases[0], newBases[1]]; // 打者上一壘，其餘推進

  // 3. 重置球數並加分
  const newState = addScore({
    ...errorState,
    bases: newBases,
    currentBatter: nextBatter
  }, scorers.length);

  // 紀錄歷史
  if (isUserBatting(state)) {
    newState.history = [{
      inning: state.inning,
      batter: state.lineup[state.currentBatter].name,
      result: '失誤上壘',
      rbi: scorers.length,
      scorers: scorers
    }, ...state.history];
  }

  return newState;
}

// 輔助函數：處理保送 (擠壘邏輯)
function handleWalk(state) {
  const batterName = state.lineup[state.currentBatter].name;
  let newBases = [...state.bases];
  let scorers = [];
  const nextBatter = getNextBatterIndex(state);

  if (newBases[0]) { // 一壘有人
    if (newBases[1]) { // 二壘有人
      if (newBases[2]) { // 三壘有人
        scorers.push(newBases[2]); // 擠回本壘
      }
      newBases[2] = newBases[1]; // 二壘擠上三壘
    }
    newBases[1] = newBases[0]; // 一壘擠上二壘
  }
  newBases[0] = batterName; // 打者上一壘


  const newState = addScore({
    ...state,
    bases: newBases,
    currentBatter: nextBatter
  }, scorers.length);

  // 紀錄歷史
  if (isUserBatting(state)) {
    newState.history = [{
      inning: state.inning,
      batter: state.lineup[state.currentBatter].name,
      result: '保送',
      rbi: scorers.length,
      scorers: scorers
    }, ...state.history];
  }

  return newState;
}

// 輔助函數：處理高飛犧牲/推進 (Sacrifice/Advance)
function handleSacrifice(state) {
  const batterName = state.lineup[state.currentBatter].name;
  let newBases = [...state.bases];
  let scorers = [];
  const nextBatter = getNextBatterIndex(state);

  // 簡單邏輯：所有跑者推進一個壘包，三壘跑者得分
  // (這是一個簡化的推進邏輯，適用於大多數犧牲打或野選)
  if (newBases[2]) scorers.push(newBases[2]); // 三壘回來
  newBases[2] = newBases[1]; // 二壘上三壘
  newBases[1] = newBases[0]; // 一壘上二壘
  newBases[0] = null; // 打者出局，一壘變空 (除非是野選上壘，這裡假設是犧牲打出局)

  // 處理得分
  let newState = addScore({
    ...state,
    bases: newBases,
    // 注意：這裡不更新 currentBatter，因為 handleOut 會做
  }, scorers.length);

  // 呼叫 handleOut 處理換局邏輯 (如果 3 出局)
  // 傳入 '犧牲/推進' 作為紀錄結果
  newState = handleOut(newState, '犧牲/推進');

  // 修正 handleOut 可能覆蓋的 history (因為我們要加打點資訊)
  if (isUserBatting(state) && newState.history.length > 0) {
    newState.history[0].rbi = scorers.length;
    newState.history[0].scorers = scorers;
  }

  return newState;
}

// 輔助函數：處理出局與換局邏輯
function handleOut(state, result = '出局', customPlayer = null) {
  const newOuts = state.outs + 1;
  const nextBatter = getNextBatterIndex(state);

  // 如果出局數達到 3
  if (newOuts >= 3) {
    // 計算殘壘 (LOB)
    const currentLOB = state.bases.filter(b => b).length;
    const newGuestLOB = state.isTopInning ? state.guestLOB + currentLOB : state.guestLOB;
    const newHomeLOB = !state.isTopInning ? state.homeLOB + currentLOB : state.homeLOB;

    // 換局邏輯
    const nextIsTop = !state.isTopInning;
    // 如果原本是下半局，換局後變成上半局，局數 + 1
    const nextInning = state.isTopInning ? state.inning : state.inning + 1;

    const newState = {
      ...state,
      outs: 0,
      isTopInning: nextIsTop,
      inning: nextInning,
      bases: [null, null, null], // 換局清空壘包
      guestLOB: newGuestLOB,
      homeLOB: newHomeLOB,
      currentBatter: nextBatter, // 換局後，下一局的第一位打者是下一棒
    };

    // 紀錄歷史 (換局前的出局)
    if (isUserBatting(state)) {
      newState.history = [{
        inning: state.inning,
        batter: customPlayer || state.lineup[state.currentBatter].name,
        result: result
      }, ...state.history];
    }
    return newState;
  }

  // 普通出局，重置球數
  const newState = {
    ...state,
    outs: newOuts,
    currentBatter: nextBatter,
  };

  // 紀錄歷史
  if (isUserBatting(state)) {
    newState.history = [{
      inning: state.inning,
      batter: customPlayer || state.lineup[state.currentBatter].name,
      result: result
    }, ...state.history];
  }

  return newState;
}

// 4. 主組件
const BaseballScoreboard = () => {
  const [state, dispatch] = useReducer(scoreReducer, initialState);
  const [draggedIndex, setDraggedIndex] = React.useState(null);
  const [setup, setSetup] = React.useState({
    userTeamName: '我們',
    opponentTeamName: '對手',
    lineupSize: 9,
    totalInnings: 7
  });
  const fileInputRef = React.useRef(null);
  const [isPlaying, setIsPlaying] = React.useState(false); // 自動播放狀態
  
  // 手機版面適配
  const [activeTab, setActiveTab] = React.useState('scoreboard');
  const [isMobile, setIsMobile] = React.useState(window.innerWidth < 768);

  React.useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 紀錄展開/收合的狀態 (預設展開第 1 局)
  const [expandedInnings, setExpandedInnings] = React.useState({ 1: true });

  // 當局數改變時，自動展開新局數，並收合其他局數
  React.useEffect(() => {
    setExpandedInnings({ [state.inning]: true });
  }, [state.inning]);

  // 自動播放邏輯
  React.useEffect(() => {
    let interval;
    if (isPlaying) {
      interval = setInterval(() => {
        if (state.futureStates && state.futureStates.length > 0) {
          dispatch({ type: ACTIONS.REDO });
        } else {
          setIsPlaying(false); // 播完了
        }
      }, 1500); // 每 1.5 秒一步
    }
    return () => clearInterval(interval);
  }, [isPlaying, state.futureStates]);

  const toggleInning = (inning) => {
    setExpandedInnings(prev => ({
      ...prev,
      [inning]: !prev[inning]
    }));
  };

  // 將歷史紀錄按局數分組
  const historyByInning = state.history.reduce((acc, record) => {
    if (!acc[record.inning]) acc[record.inning] = [];
    acc[record.inning].push(record);
    return acc;
  }, {});
  
  // 取得排序後的局數 (從新到舊)
  const sortedInnings = Object.keys(historyByInning).map(Number).sort((a, b) => b - a);

  // 計算表格需要顯示多少局 (至少 9 局，如果有延長賽則顯示更多)
  const totalInningsToShow = Math.max(state.totalInnings || 7, state.inning);
  const inningHeaders = Array.from({ length: totalInningsToShow }, (_, i) => i + 1);

  // 處理壘包點擊邏輯
  const handleBaseClick = (baseIndex) => {
    if (state.selectedBase === baseIndex) {
      dispatch({ type: ACTIONS.SELECT_BASE, payload: baseIndex }); // 取消選取
    } else if (state.selectedBase !== null) {
      dispatch({ type: ACTIONS.MOVE_RUNNER, payload: baseIndex }); // 移動跑者
    } else {
      // 沒有選取時
      if (state.bases[baseIndex]) {
        dispatch({ type: ACTIONS.SELECT_BASE, payload: baseIndex }); // 選取跑者
      } else {
        dispatch({ type: ACTIONS.TOGGLE_BASE, payload: baseIndex }); // 新增跑者 (Toggle)
      }
    }
  };

  // 取得顯示用的隊名
  const guestName = state.userTeam === 'GUEST' ? state.userTeamName : state.opponentTeamName;
  const homeName = state.userTeam === 'HOME' ? state.userTeamName : state.opponentTeamName;

  // 匯出功能
  const handleExport = () => {
    const dataStr = JSON.stringify(state, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    link.download = `baseball_score_${date}.json`;
    link.href = url;
    link.click();
  };

  // 匯入功能
  const handleImport = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const loadedState = JSON.parse(e.target.result);
        dispatch({ type: ACTIONS.LOAD_GAME, payload: loadedState });
      } catch (err) {
        alert('檔案格式錯誤，無法讀取');
      }
    };
    reader.readAsText(file);
    event.target.value = ''; // 重置 input，允許重複匯入同個檔案
  };

  if (!state.gameStarted) {
    return (
      <div style={{ textAlign: 'center', marginTop: '50px', fontFamily: 'Arial, sans-serif' }}>
        <h2>比賽設定</h2>
        <div style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
          <div>
            <label>我方隊名：</label>
            <input 
              type="text" 
              value={setup.userTeamName} 
              onChange={(e) => setSetup({ ...setup, userTeamName: e.target.value })}
              style={{ padding: '5px', fontSize: '1rem' }}
            />
          </div>
          <div>
            <label>對手隊名：</label>
            <input 
              type="text" 
              value={setup.opponentTeamName} 
              onChange={(e) => setSetup({ ...setup, opponentTeamName: e.target.value })}
              style={{ padding: '5px', fontSize: '1rem' }}
            />
          </div>
          <div>
            <label>打序人數：</label>
            <input 
              type="number" 
              value={setup.lineupSize} 
              onChange={(e) => setSetup({ ...setup, lineupSize: parseInt(e.target.value) || 9 })}
              style={{ padding: '5px', fontSize: '1rem', width: '60px' }}
              min="9" max="15"
            />
          </div>
          <div>
            <label>比賽局數：</label>
            <input 
              type="number" 
              value={setup.totalInnings} 
              onChange={(e) => setSetup({ ...setup, totalInnings: parseInt(e.target.value) || 7 })}
              style={{ padding: '5px', fontSize: '1rem', width: '60px' }}
              min="1" max="99"
            />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'center', gap: '20px' }}>
          <button onClick={() => dispatch({ type: ACTIONS.START_GAME, payload: { userTeam: 'GUEST', ...setup } })} style={{ padding: '20px', fontSize: '1.2rem', cursor: 'pointer', width: isMobile ? '100%' : 'auto' }}>
            先攻 (客隊 / Guest)
          </button>
          <button onClick={() => dispatch({ type: ACTIONS.START_GAME, payload: { userTeam: 'HOME', ...setup } })} style={{ padding: '20px', fontSize: '1.2rem', cursor: 'pointer', width: isMobile ? '100%' : 'auto' }}>
            後攻 (主隊 / Home)
          </button>
        </div>

        {/* 匯入按鈕 (開賽前也可以匯入) */}
        <div style={{ marginTop: '40px', borderTop: '1px solid #eee', paddingTop: '20px' }}>
          <p style={{ color: '#666', marginBottom: '10px' }}>或是匯入之前的比賽紀錄：</p>
          <input 
            type="file" 
            accept=".json" 
            ref={fileInputRef} 
            style={{ display: 'none' }} 
            onChange={handleImport} 
          />
          <button onClick={() => fileInputRef.current.click()} style={{ background: '#6c757d', color: 'white', padding: '10px 20px' }}>
            📂 匯入比賽紀錄 (Import JSON)
          </button>
        </div>
      </div>
    );
  }

  if (!state.isLineupConfirmed) {
    return (
      <div style={{ fontFamily: 'Arial, sans-serif', padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
        <h2 style={{ textAlign: 'center' }}>調整打序 (Arrange Lineup)</h2>
        <p style={{ textAlign: 'center', color: '#666' }}>拖拉球員可調整棒次，直接輸入可修改姓名背號</p>
        
        <div style={{ border: '1px solid #ccc', borderRadius: '8px', overflow: 'hidden', marginBottom: '20px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#333', color: 'white' }}>
              <tr>
                <th style={{ padding: '10px' }}>棒次</th>
                <th style={{ padding: '10px' }}>背號</th>
                <th style={{ padding: '10px' }}>姓名</th>
              </tr>
            </thead>
            <tbody>
              {state.lineup.map((player, index) => (
                <tr 
                  key={player.id} 
                  draggable
                  onDragStart={(e) => {
                    if (e.target.tagName === 'INPUT') {
                      e.preventDefault(); // 允許輸入框正常運作
                      return;
                    }
                    setDraggedIndex(index);
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (draggedIndex !== null && draggedIndex !== index) {
                      dispatch({ type: ACTIONS.MOVE_PLAYER, payload: { fromIndex: draggedIndex, toIndex: index } });
                    }
                    setDraggedIndex(null);
                  }}
                  style={{ 
                    background: index % 2 === 0 ? '#f9f9f9' : 'white', 
                    cursor: 'move',
                    borderBottom: '1px solid #eee',
                    opacity: draggedIndex === index ? 0.5 : 1
                  }}
                >
                  <td style={{ padding: '10px', textAlign: 'center' }}>{player.order}</td>
                  <td style={{ padding: '10px', textAlign: 'center' }}>
                    <input 
                      type="number" 
                      value={player.number} 
                      onClick={(e) => e.stopPropagation()} 
                      onChange={(e) => dispatch({ type: ACTIONS.UPDATE_PLAYER, payload: { index, field: 'number', value: e.target.value } })}
                      style={{ width: '50px', padding: '5px', textAlign: 'center' }}
                    />
                  </td>
                  <td style={{ padding: '10px', textAlign: 'center' }}>
                    <input 
                      type="text" 
                      value={player.name} 
                      onClick={(e) => e.stopPropagation()} 
                      onChange={(e) => dispatch({ type: ACTIONS.UPDATE_PLAYER, payload: { index, field: 'name', value: e.target.value } })}
                      style={{ width: '100px', padding: '5px', textAlign: 'center' }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ textAlign: 'center', display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'center', gap: '10px' }}>
          <button 
            onClick={() => dispatch({ type: ACTIONS.ADD_PLAYER })}
            style={{ padding: '15px 20px', fontSize: '1.1rem', background: '#17a2b8', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', width: isMobile ? '100%' : 'auto' }}
          >
            +1 增加打者
          </button>
          <button 
            onClick={() => dispatch({ type: ACTIONS.REMOVE_PLAYER })}
            style={{ padding: '15px 20px', fontSize: '1.1rem', background: '#dc3545', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', width: isMobile ? '100%' : 'auto' }}
          >
            -1 減少打者
          </button>
          <button 
            onClick={() => dispatch({ type: ACTIONS.CONFIRM_LINEUP })} 
            style={{ padding: '15px 40px', fontSize: '1.2rem', background: '#28a745', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', width: isMobile ? '100%' : 'auto' }}
          >
            確認打序並開始比賽
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', padding: isMobile ? '5px' : '20px', paddingBottom: isMobile ? '80px' : '20px', maxWidth: '1200px', margin: '0 auto', display: isMobile ? 'block' : 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
      {isMobile && (
        <style>{`
          button { min-height: 40px; touch-action: manipulation; font-size: 0.9rem; padding: 2px 5px; }
          input { min-height: 40px; }
        `}</style>
      )}
      
      {/* 左側：打序表 (Lineup) */}
      <div style={{ display: (isMobile && activeTab !== 'lineup') ? 'none' : 'flex', flexDirection: 'column', gap: '20px', flex: '1', minWidth: '250px', width: isMobile ? '100%' : 'auto' }}>
      <div style={{ flex: '1', minWidth: '250px', border: '1px solid #ddd', borderRadius: '8px', overflow: 'hidden', background: 'white' }}>
        <div style={{ background: '#333', color: 'white', padding: '8px', textAlign: 'center', fontWeight: 'bold' }}>
          {state.userTeamName}打序
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ background: '#eee', borderBottom: '1px solid #ccc' }}>
              <th style={{ padding: '5px' }}>棒次</th>
              <th style={{ padding: '5px' }}>背號</th>
              <th style={{ padding: '5px' }}>姓名</th>
            </tr>
          </thead>
          <tbody>
            {state.lineup.map((player, index) => (
              <tr key={index} style={{ background: index === state.currentBatter ? '#fff3cd' : 'transparent', borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '5px', textAlign: 'center', fontWeight: index === state.currentBatter ? 'bold' : 'normal' }}>{player.order}</td>
                <td style={{ padding: '5px', textAlign: 'center' }}>{player.number}</td>
                <td style={{ padding: '5px', textAlign: 'center', fontWeight: index === state.currentBatter ? 'bold' : 'normal' }}>
                  {player.name} {index === state.currentBatter && '⚾️'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* 板凳區 (Bench) */}
      <div style={{ border: '1px solid #ddd', borderRadius: '8px', overflow: 'hidden', background: 'white' }}>
        <div style={{ background: '#666', color: 'white', padding: '8px', textAlign: 'center', fontWeight: 'bold' }}>
          板凳區 (點擊代打)
        </div>
        <div style={{ padding: '10px', display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
          {state.bench.map((player, index) => (
            <button 
              key={index} 
              onClick={() => dispatch({ type: ACTIONS.SUBSTITUTE, payload: index })}
              style={{ fontSize: '0.8rem', padding: '5px 10px', background: '#eee', border: '1px solid #ccc' }}
              title={`換 ${player.name} 代打第 ${state.lineup[state.currentBatter].order} 棒`}
            >
              {player.name}
            </button>
          ))}
        </div>
      </div>
      </div>

      {/* 中間：記分板主體 */}
      <div style={{ display: (isMobile && activeTab !== 'scoreboard') ? 'none' : 'block', flex: '2', minWidth: isMobile ? '100%' : '350px', width: isMobile ? '100%' : 'auto', border: '1px solid #ccc', borderRadius: '8px', background: '#f9f9f9', padding: isMobile ? '10px' : '20px' }}>
      {!isMobile && <h2 style={{ textAlign: 'center', marginTop: 0 }}>棒球記分板</h2>}
      
      {/* 傳統記分板表格 (Line Score) */}
      <div style={{ overflowX: 'auto', marginBottom: isMobile ? '10px' : '20px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ background: '#333', color: 'white' }}>
              <th style={{ padding: '5px' }}>Team</th>
              {inningHeaders.map(i => <th key={i} style={{ padding: '5px', minWidth: '20px' }}>{i}</th>)}
              <th style={{ padding: '5px', background: '#555' }}>R</th>
              <th style={{ padding: '5px', background: '#555' }}>H</th>
              <th style={{ padding: '5px', background: '#555' }}>E</th>
              <th style={{ padding: '5px', background: '#555', fontSize: '0.8em' }}>LOB</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid #ccc' }}>
              <td style={{ fontWeight: 'bold', padding: '5px' }}>{guestName}</td>
              {inningHeaders.map((_, i) => (
                <td key={i} style={{ padding: '5px' }}>{state.guestInningScores[i] !== undefined ? state.guestInningScores[i] : (i < state.inning ? 0 : '')}</td>
              ))}
              <td style={{ fontWeight: 'bold', background: '#eee' }}>{state.guestScore}</td>
              <td style={{ fontWeight: 'bold', background: '#eee' }}>{state.guestHits}</td>
              <td style={{ fontWeight: 'bold', background: '#eee' }}>{state.guestErrors}</td>
              <td style={{ color: '#666' }}>{state.guestLOB}</td>
            </tr>
            <tr>
              <td style={{ fontWeight: 'bold', padding: '5px' }}>{homeName}</td>
              {inningHeaders.map((_, i) => (
                <td key={i} style={{ padding: '5px' }}>{state.homeInningScores[i] !== undefined ? state.homeInningScores[i] : (i < state.inning - (state.isTopInning ? 1 : 0) ? 0 : '')}</td>
              ))}
              <td style={{ fontWeight: 'bold', background: '#eee' }}>{state.homeScore}</td>
              <td style={{ fontWeight: 'bold', background: '#eee' }}>{state.homeHits}</td>
              <td style={{ fontWeight: 'bold', background: '#eee' }}>{state.homeErrors}</td>
              <td style={{ color: '#666' }}>{state.homeLOB}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 比分顯示 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: isMobile ? '10px' : '20px', background: '#f0f0f0', padding: isMobile ? '5px' : '10px', borderRadius: '5px' }}>
        <div style={{ textAlign: 'center' }}>
          <h3 style={{ margin: '5px 0', fontSize: isMobile ? '1rem' : '1.17em' }}>{guestName}</h3>
          <div style={{ fontSize: isMobile ? '1.5rem' : '2rem', fontWeight: 'bold' }}>{state.guestScore}</div>
        </div>
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: isMobile ? '1rem' : '1.2rem' }}>{state.inning} 局{state.isTopInning ? '上' : '下'}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <h3 style={{ margin: '5px 0', fontSize: isMobile ? '1rem' : '1.17em' }}>{homeName}</h3>
          <div style={{ fontSize: isMobile ? '1.5rem' : '2rem', fontWeight: 'bold' }}>{state.homeScore}</div>
        </div>
      </div>

      {/* 中間區域：壘包與球數 */}
      <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', marginBottom: isMobile ? '10px' : '20px' }}>
        
        {/* 壘包顯示 (Diamond) */}
        <div style={{ position: 'relative', width: '100px', height: '100px' }}>
          {/* 二壘 */}
          <div onClick={() => handleBaseClick(1)} style={{ cursor: 'pointer', position: 'absolute', top: '0', left: '50%', transform: 'translateX(-50%) rotate(45deg)', width: '24px', height: '24px', background: state.bases[1] ? '#ffcc00' : '#ddd', border: state.selectedBase === 1 ? '3px solid red' : '2px solid #333', zIndex: 2 }} title="二壘" />
          {/* 一壘 */}
          <div onClick={() => handleBaseClick(0)} style={{ cursor: 'pointer', position: 'absolute', top: '50%', right: '0', transform: 'translateY(-50%) rotate(45deg)', width: '24px', height: '24px', background: state.bases[0] ? '#ffcc00' : '#ddd', border: state.selectedBase === 0 ? '3px solid red' : '2px solid #333', zIndex: 2 }} title="一壘" />
          {/* 三壘 */}
          <div onClick={() => handleBaseClick(2)} style={{ cursor: 'pointer', position: 'absolute', top: '50%', left: '0', transform: 'translateY(-50%) rotate(45deg)', width: '24px', height: '24px', background: state.bases[2] ? '#ffcc00' : '#ddd', border: state.selectedBase === 2 ? '3px solid red' : '2px solid #333', zIndex: 2 }} title="三壘" />
          {/* 本壘 (可點擊得分) */}
          <div 
            onClick={() => state.selectedBase !== null && dispatch({ type: ACTIONS.MOVE_RUNNER, payload: 3 })}
            style={{ 
              position: 'absolute', bottom: '0', left: '50%', transform: 'translateX(-50%)', 
              width: '0', height: '0', 
              borderLeft: '12px solid transparent', borderRight: '12px solid transparent', 
              borderTop: `12px solid ${state.selectedBase !== null ? 'red' : '#333'}`,
              cursor: state.selectedBase !== null ? 'pointer' : 'default', zIndex: 1
            }} 
            title="本壘 (選取跑者後點擊此處得分)"
          />
        </div>

        {/* 球數計數器 (B-S-O) */}
        <div>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
          <span style={{ width: '50px', fontWeight: 'bold' }}>O</span>
          {[...Array(2)].map((_, i) => (
            <div key={i} style={{ 
              width: '20px', height: '20px', borderRadius: '50%', margin: '0 5px', border: '1px solid #333',
              backgroundColor: i < state.outs ? 'red' : 'transparent' 
            }} />
          ))}
        </div>
        </div>
      </div>

      {/* 操作按鈕 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: isMobile ? '4px' : '8px' }}>
        <button onClick={() => dispatch({ type: ACTIONS.STRIKEOUT })}>三振 (SO)</button>
        <button onClick={() => dispatch({ type: ACTIONS.ADD_OUT })}>{state.selectedBase !== null ? '跑者出局 (Out)' : '出局 (Out)'}</button>
        <button onClick={() => dispatch({ type: ACTIONS.WALK })} style={{ gridColumn: 'span 2' }}>保送 (BB)</button>
        
        <button onClick={() => dispatch({ type: ACTIONS.HIT_SINGLE })} style={{background: '#e6f7ff'}}>一安 (1B)</button>
        <button onClick={() => dispatch({ type: ACTIONS.HIT_DOUBLE })} style={{background: '#e6f7ff'}}>二安 (2B)</button>
        <button onClick={() => dispatch({ type: ACTIONS.HIT_TRIPLE })} style={{background: '#e6f7ff'}}>三安 (3B)</button>
        <button onClick={() => dispatch({ type: ACTIONS.HIT_HR })} style={{background: '#ffebcc'}}>全壘打 (HR)</button>

        <button onClick={() => dispatch({ type: ACTIONS.SACRIFICE })} style={{background: '#e6f7ff', fontSize: '0.9em'}}>推進/犧牲 (Sac)</button>
        <button onClick={() => dispatch({ type: ACTIONS.ADD_ERROR })}>失誤 (Error)</button>
        <button onClick={() => dispatch({ type: ACTIONS.REACH_ON_ERROR })} style={{ background: '#ffe6e6' }}>失誤上壘 (ROE)</button>
        <button onClick={() => dispatch({ type: ACTIONS.ADD_SCORE })} style={{ fontSize: '0.8em' }}>手動得分 (+1)</button>
        
        <button onClick={() => dispatch({ type: ACTIONS.UNDO })} style={{ gridColumn: 'span 2', background: '#666', color: 'white' }}>↩️ 回到上一動 (Undo)</button>
        <button onClick={() => dispatch({ type: ACTIONS.REDO })} disabled={!state.futureStates?.length} style={{ gridColumn: 'span 2', background: '#666', color: 'white', opacity: !state.futureStates?.length ? 0.5 : 1 }}>重做 (Redo) ↪️</button>
        
        <button onClick={() => dispatch({ type: ACTIONS.RESET_COUNT })} style={{ gridColumn: 'span 4', background: '#ddd', marginTop: isMobile ? '5px' : '10px' }}>
          下一位打者 (Reset Count)
        </button>

        {/* 播放控制區 */}
        <details style={{ gridColumn: 'span 4', marginTop: '5px', border: '1px solid #ddd', borderRadius: '5px', padding: '5px' }}>
          <summary style={{ cursor: 'pointer', textAlign: 'center', padding: '5px', fontSize: '0.9rem', color: '#666' }}>更多功能 (重播/重置/匯出)</summary>
          <div style={{ display: 'flex', gap: '5px', background: '#333', padding: '5px', borderRadius: '5px', marginTop: '5px', marginBottom: '10px' }}>
            <button onClick={() => dispatch({ type: ACTIONS.JUMP_TO_START })} disabled={state.pastStates.length === 0} style={{ flex: 1, fontSize: '1.2rem', background: 'transparent', color: 'white' }} title="回到開始">
              ⏮
            </button>
            <button onClick={() => dispatch({ type: ACTIONS.UNDO })} disabled={state.pastStates.length === 0} style={{ flex: 1, fontSize: '1.2rem', background: 'transparent', color: 'white' }} title="上一步">
              ◀
            </button>
            <button onClick={() => setIsPlaying(!isPlaying)} style={{ flex: 2, fontSize: '1rem', background: isPlaying ? '#ff4d4f' : '#28a745', color: 'white' }}>
              {isPlaying ? '⏸ 暫停' : '▶️ 播放'}
            </button>
            <button onClick={() => dispatch({ type: ACTIONS.REDO })} disabled={!state.futureStates?.length} style={{ flex: 1, fontSize: '1.2rem', background: 'transparent', color: 'white' }} title="下一步">
              ▶
            </button>
          </div>

        <button onClick={() => dispatch({ type: ACTIONS.RESET_GAME })} style={{ width: '100%', background: '#ffcccc', marginBottom: '10px' }}>
          重置比賽 (New Game)
        </button>
        
        {/* 匯出/匯入按鈕區 */}
        <div style={{ gridColumn: 'span 4', display: 'flex', gap: '8px', marginTop: '10px' }}>
          <button onClick={handleExport} style={{ flex: 1, background: '#28a745', color: 'white' }}>
            💾 匯出紀錄 (Export)
          </button>
          <button onClick={() => fileInputRef.current.click()} style={{ flex: 1, background: '#17a2b8', color: 'white' }}>
            📂 匯入紀錄 (Import)
          </button>
          {/* 隱藏的 file input，共用同一個 ref */}
          <input 
            type="file" 
            accept=".json" 
            ref={fileInputRef} 
            style={{ display: 'none' }} 
            onChange={handleImport} 
          />
        </div>
        </details>
      </div>
      </div>

      {/* 右側：打擊紀錄 (History) */}
      <div style={{ display: (isMobile && activeTab !== 'history') ? 'none' : 'flex', flex: '1', minWidth: '250px', width: isMobile ? '100%' : 'auto', border: '1px solid #ddd', borderRadius: '8px', overflow: 'hidden', background: 'white', maxHeight: isMobile ? 'none' : '600px', flexDirection: 'column' }}>
        <div style={{ background: '#333', color: 'white', padding: '8px', textAlign: 'center', fontWeight: 'bold' }}>
          打擊紀錄 (History)
        </div>
        <div style={{ overflowY: 'auto', flex: 1, padding: '10px' }}>
          {state.history.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#888', marginTop: '20px' }}>尚無紀錄</div>
          ) : (
            sortedInnings.map(inning => (
              <div key={inning} style={{ marginBottom: '8px', border: '1px solid #eee', borderRadius: '4px', overflow: 'hidden' }}>
                <div 
                  onClick={() => toggleInning(inning)}
                  style={{ 
                    padding: '8px', 
                    background: '#f5f5f5', 
                    cursor: 'pointer', 
                    fontWeight: 'bold',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '0.9rem'
                  }}
                >
                  <span>第 {inning} 局</span>
                  <span>{expandedInnings[inning] ? '▼' : '▶'}</span>
                </div>
                {expandedInnings[inning] && (
                  <div style={{ background: 'white' }}>
                    {historyByInning[inning].map((record, index) => (
                      <div key={index} style={{ padding: '8px', borderBottom: '1px solid #eee', fontSize: '0.9rem' }}>
                        <span style={{ marginRight: '5px' }}>{record.batter}</span>
                        <span style={{ color: record.result.includes('安打') || record.result.includes('全壘打') ? 'red' : 'black', fontWeight: 'bold' }}>
                          {record.result}
                        </span>
                        {record.rbi > 0 && (
                          <span style={{ fontSize: '0.85em', color: '#666', marginLeft: '5px' }}>打點:{record.rbi}</span>
                        )}
                        {record.scorers && record.scorers.length > 0 && (
                          <div style={{ fontSize: '0.8em', color: '#888', marginTop: '2px' }}>得分: {record.scorers.join(', ')}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* 手機版底部導航 */}
      {isMobile && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, width: '100%', height: '60px', background: 'white', borderTop: '1px solid #ccc', display: 'flex', zIndex: 1000, boxShadow: '0 -2px 10px rgba(0,0,0,0.1)' }}>
          <button onClick={() => setActiveTab('lineup')} style={{ flex: 1, border: 'none', background: activeTab === 'lineup' ? '#e6f7ff' : 'transparent', color: activeTab === 'lineup' ? '#007bff' : '#666', fontWeight: 'bold', fontSize: '1rem' }}>
            📝 打序
          </button>
          <button onClick={() => setActiveTab('scoreboard')} style={{ flex: 1, border: 'none', background: activeTab === 'scoreboard' ? '#e6f7ff' : 'transparent', color: activeTab === 'scoreboard' ? '#007bff' : '#666', fontWeight: 'bold', fontSize: '1rem' }}>
            ⚾️ 記分
          </button>
          <button onClick={() => setActiveTab('history')} style={{ flex: 1, border: 'none', background: activeTab === 'history' ? '#e6f7ff' : 'transparent', color: activeTab === 'history' ? '#007bff' : '#666', fontWeight: 'bold', fontSize: '1rem' }}>
            📜 紀錄
          </button>
        </div>
      )}

    </div>
  );
};

export default BaseballScoreboard;

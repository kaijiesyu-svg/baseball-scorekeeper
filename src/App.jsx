import React from 'react';
import BaseballScoreboard from './Scoreboard'; // 引入剛剛建立的元件
import './App.css'; // 保持樣式引入 (可選)

function App() {
  return (
    <div className="App">
      <h1 style={{ textAlign: 'center' }}>React 棒球記分板</h1>
      {/* 使用記分板元件 */}
      <BaseballScoreboard />
    </div>
  );
}

export default App;

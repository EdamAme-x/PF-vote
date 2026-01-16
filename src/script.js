let hasVoted = false;
let currentVote = null;

// FingerprintJSが読み込まれるまで待つ
function waitForFingerprintJS() {
  return new Promise((resolve) => {
    if (typeof FingerprintJS !== 'undefined') {
      resolve();
    } else {
      const checkInterval = setInterval(() => {
        if (typeof FingerprintJS !== 'undefined') {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    }
  });
}

// FingerprintJSを使用してクライアント側フィンガープリント生成
async function generateClientFingerprint() {
  try {
    await waitForFingerprintJS();
    const fp = await FingerprintJS.load()
    const result = await fp.get()
    return result.visitorId
  } catch (e) {
    console.error('FingerprintJS error:', e)
    throw new Error('フィンガープリント生成失敗')
  }
}

// 投票状況をチェック
async function checkVoteStatus() {
  try {
    const response = await fetch('/check-vote', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      console.error('投票状況確認失敗');
      return;
    }

    const data = await response.json();
    if (data.hasVoted && data.vote) {
      hasVoted = true;
      currentVote = data.vote;
      
      // UI更新
      const votedStatus = document.getElementById('voted-status');
      votedStatus.innerHTML = 
        '<span class="error"><strong>⚠️ 既に投票済みです</strong></span><br>' +
        'あなたの投票: <strong>' + data.vote + '</strong>';
      votedStatus.style.display = 'block';
      votedStatus.style.padding = '15px';
      votedStatus.style.background = '#fff3cd';
      votedStatus.style.borderLeft = '4px solid #ff9800';
      votedStatus.style.borderRadius = '4px';
      votedStatus.style.color = '#e65100';
      
      // 投票ボタンを無効化
      const buttons = document.getElementById('vote-buttons').querySelectorAll('button');
      buttons.forEach(btn => {
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
      });
    }
  } catch (e) {
    console.error('Vote status check error:', e);
  }
}

// 初期化処理
async function initializeVoting() {
  try {
    const clientFp = await generateClientFingerprint();
    const response = await fetch('/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientFingerprint: clientFp })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || '初期化失敗');
    }

    const data = await response.json();
    
    // 初期化済み状態の表示内容を変更
    if (data.initialized) {
      document.getElementById('status').innerHTML = 
        '<span class="error"><strong>⚠️ 初期化済みです</strong></span>';
      document.getElementById('status').classList.remove('info');
      document.getElementById('status').classList.add('error');
    } else {
      document.getElementById('status').innerHTML = 
        '<span class="success"><strong>✓ 初期化完了</strong></span>';
      document.getElementById('status').classList.remove('info');
      document.getElementById('status').classList.add('success');
    }
    
    // 投票状況をチェック
    await checkVoteStatus();
  } catch (e) {
    document.getElementById('status').innerHTML = 
      '<span class="error"><strong>✗ 初期化失敗</strong></span><br>' + e.message;
    document.getElementById('status').classList.remove('info');
    document.getElementById('status').classList.add('error');
  }
}

// 投票処理
async function vote(option) {
  if (hasVoted) {
    alert('⚠️ 既に投票済みです。' + String.fromCharCode(10) + '再投票はできません。' + String.fromCharCode(10) + String.fromCharCode(10) + 'あなたの投票: ' + currentVote);
    return;
  }
  
  try {
    const response = await fetch('/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voteOption: option })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || '投票失敗');
    }

    const data = await response.json();
    hasVoted = true;
    currentVote = option;
    
    // UI更新
    const votedStatus = document.getElementById('voted-status');
    votedStatus.innerHTML = 
      '<span class="error"><strong>⚠️ 既に投票済みです</strong></span><br>' +
      'あなたの投票: <strong>' + option + '</strong>';
    votedStatus.style.display = 'block';
    votedStatus.style.padding = '15px';
    votedStatus.style.background = '#fff3cd';
    votedStatus.style.borderLeft = '4px solid #ff9800';
    votedStatus.style.borderRadius = '4px';
    votedStatus.style.color = '#e65100';
    
    // 投票ボタンを無効化
    const buttons = document.getElementById('vote-buttons').querySelectorAll('button');
    buttons.forEach(btn => {
      btn.disabled = true;
      btn.style.opacity = '0.5';
      btn.style.cursor = 'not-allowed';
    });
    
    alert('投票完了: ' + data.message);
  } catch (e) {
    alert('投票エラー: ' + e.message);
  }
}

// ページ読み込み時に初期化
window.addEventListener('DOMContentLoaded', initializeVoting);

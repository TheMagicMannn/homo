import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Activity, Zap, TrendingUp, TrendingDown, Settings, RefreshCw,
  AlertTriangle, CheckCircle, XCircle, Clock, Eye, Wallet,
  BarChart3, Terminal, Shield, Cpu, ChevronDown, ChevronUp, Save
} from 'lucide-react';
import './App.css';

const API = process.env.REACT_APP_BACKEND_URL;

function formatTime(iso) {
  if (!iso) return '--';
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString();
}

function truncateHash(hash) {
  if (!hash) return '--';
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

function StatusBadge({ status }) {
  const colors = {
    running: 'border-[#00FF94] text-[#00FF94] bg-[#00FF94]/10',
    idle: 'border-[#00FFFF] text-[#00FFFF] bg-[#00FFFF]/10',
    stopped: 'border-[#FF0055] text-[#FF0055] bg-[#FF0055]/10',
    error: 'border-[#FF0055] text-[#FF0055] bg-[#FF0055]/10',
    success: 'border-[#00FF94] text-[#00FF94] bg-[#00FF94]/10',
    reverted: 'border-[#FF0055] text-[#FF0055] bg-[#FF0055]/10',
    detected: 'border-[#00FFFF] text-[#00FFFF] bg-[#00FFFF]/10',
    evaluating: 'border-yellow-400 text-yellow-400 bg-yellow-400/10',
    expired: 'border-[#737373] text-[#737373] bg-[#737373]/10',
    profitable: 'border-[#00FF94] text-[#00FF94] bg-[#00FF94]/10',
  };
  return (
    <span data-testid={`status-badge-${status}`} className={`inline-block border px-2 py-0.5 text-[10px] uppercase tracking-widest font-bold ${colors[status] || 'border-[#333] text-[#737373]'}`}>
      {status}
    </span>
  );
}

function StatCard({ label, value, sub, icon: Icon, color = '#00FF94' }) {
  return (
    <div data-testid={`stat-card-${label.replace(/\s/g, '-').toLowerCase()}`} className="border border-[#333] bg-black/40 p-4 relative overflow-hidden group hover:border-[#00FF94]/30 transition-colors">
      <div className="flex items-start justify-between mb-2">
        <span className="text-[10px] uppercase tracking-widest text-[#737373] font-mono">{label}</span>
        {Icon && <Icon size={14} style={{ color }} className="opacity-60" />}
      </div>
      <div className="font-display text-2xl tracking-tight" style={{ color, fontFamily: 'Chivo Mono, monospace' }}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-[#737373] mt-1 font-mono">{sub}</div>}
      <div className="absolute inset-0 bg-gradient-to-r opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" style={{ background: `linear-gradient(135deg, ${color}05, transparent)` }} />
    </div>
  );
}

function LogLine({ log }) {
  const levelColors = {
    INFO: 'text-[#00FFFF]',
    WARN: 'text-yellow-400',
    ERROR: 'text-[#FF0055]',
    PROFIT: 'text-[#00FF94]',
    SCAN: 'text-[#737373]',
  };
  const time = log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : '--:--:--';
  return (
    <div className="flex gap-3 text-xs font-mono py-0.5 hover:bg-white/5 px-2 transition-colors">
      <span className="text-[#737373] shrink-0">{time}</span>
      <span className={`shrink-0 w-12 ${levelColors[log.level] || 'text-[#737373]'}`}>[{log.level}]</span>
      <span className="text-[#e0e0e0]">{log.message}</span>
    </div>
  );
}

function App() {
  const [stats, setStats] = useState(null);
  const [status, setStatus] = useState(null);
  const [opportunities, setOpportunities] = useState([]);
  const [trades, setTrades] = useState([]);
  const [logs, setLogs] = useState([]);
  const [settings, setSettings] = useState(null);
  const [editSettings, setEditSettings] = useState(null);
  const [activeTab, setActiveTab] = useState('opportunities');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const logsRef = useRef(null);

  const fetchAll = useCallback(async () => {
    try {
      const [statsRes, statusRes, oppsRes, tradesRes, logsRes, settingsRes] = await Promise.all([
        fetch(`${API}/api/stats`),
        fetch(`${API}/api/status`),
        fetch(`${API}/api/opportunities?limit=50`),
        fetch(`${API}/api/trades?limit=50`),
        fetch(`${API}/api/logs?limit=100`),
        fetch(`${API}/api/settings`),
      ]);
      const [s, st, o, t, l, se] = await Promise.all([
        statsRes.json(), statusRes.json(), oppsRes.json(), tradesRes.json(), logsRes.json(), settingsRes.json()
      ]);
      setStats(s);
      setStatus(st);
      setOpportunities(o.opportunities || []);
      setTrades(t.trades || []);
      setLogs(l.logs || []);
      setSettings(se);
      if (!editSettings) setEditSettings(se);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Fetch error:', err);
    }
  }, [editSettings]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 5000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logs]);

  const saveSettings = async () => {
    setSaving(true);
    try {
      await fetch(`${API}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editSettings),
      });
      await fetchAll();
    } catch (err) {
      console.error('Save error:', err);
    }
    setSaving(false);
  };

  const profitVal = stats?.total_profit_eth || 0;
  const profitColor = profitVal >= 0 ? '#00FF94' : '#FF0055';

  return (
    <div className="h-screen flex flex-col bg-[#050505] text-[#e0e0e0] overflow-hidden">
      {/* HEADER */}
      <header data-testid="dashboard-header" className="border-b border-[#333] bg-[#0A0A0A] px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Zap size={20} className="text-[#00FF94]" />
            <h1 className="text-lg font-heading font-bold tracking-tight uppercase text-white">
              FlashBot<span className="text-[#00FF94]">::</span>Dashboard
            </h1>
          </div>
          <div className="h-4 w-px bg-[#333]" />
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${status?.status === 'running' ? 'bg-[#00FF94] animate-pulse' : status?.status === 'idle' ? 'bg-[#00FFFF]' : 'bg-[#FF0055]'}`} />
            <StatusBadge status={status?.status || 'unknown'} />
          </div>
          <span className="text-[10px] text-[#737373] uppercase tracking-wider font-mono">
            {status?.network || 'base'} mainnet
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-[11px] font-mono text-[#737373]">
            <Wallet size={12} />
            <span>{status?.wallet_address ? truncateHash(status.wallet_address) : 'Not Connected'}</span>
          </div>
          <button
            data-testid="refresh-btn"
            onClick={fetchAll}
            className="border border-[#333] bg-transparent text-[#737373] hover:text-white hover:border-white p-1.5 transition-all"
          >
            <RefreshCw size={14} />
          </button>
          <button
            data-testid="settings-toggle-btn"
            onClick={() => setSettingsOpen(!settingsOpen)}
            className="border border-[#333] bg-transparent text-[#737373] hover:text-[#00FF94] hover:border-[#00FF94]/50 p-1.5 transition-all"
          >
            <Settings size={14} />
          </button>
        </div>
      </header>

      {/* MAIN */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* STATS ROW */}
        <div data-testid="stats-section" className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-px bg-[#333] border-b border-[#333]">
          <StatCard label="Net Profit" value={`${profitVal >= 0 ? '+' : ''}${profitVal.toFixed(4)} ETH`} sub={`$${stats?.total_profit_usd?.toFixed(2) || '0.00'}`} icon={TrendingUp} color={profitColor} />
          <StatCard label="Win Rate" value={`${stats?.win_rate || 0}%`} sub={`${stats?.successful_trades || 0}/${stats?.total_trades || 0} trades`} icon={BarChart3} color="#00FFFF" />
          <StatCard label="Total Trades" value={stats?.total_trades || 0} sub={`Gas: ${stats?.total_gas_spent?.toFixed(5) || '0'} ETH`} icon={Activity} color="#FF00FF" />
          <StatCard label="Opportunities" value={stats?.total_opportunities_detected || 0} sub={`${stats?.profitable_opportunities || 0} profitable`} icon={Eye} color="#00FF94" />
          <StatCard label="Best Trade" value={`${parseFloat(stats?.best_trade_profit || 0).toFixed(4)} ETH`} sub={stats?.best_trade_path || 'N/A'} icon={TrendingUp} color="#00FF94" />
          <StatCard label="Avg Profit" value={`${stats?.avg_profit_per_trade?.toFixed(5) || '0'} ETH`} sub="per successful trade" icon={Cpu} color="#00FFFF" />
        </div>

        {/* SETTINGS PANEL (collapsible) */}
        {settingsOpen && editSettings && (
          <div data-testid="settings-panel" className="border-b border-[#333] bg-[#0A0A0A] px-6 py-4 animate-in">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-heading font-bold uppercase tracking-wider text-[#00FF94]">
                <Settings size={14} className="inline mr-2" />Bot Configuration
              </h2>
              <button
                data-testid="save-settings-btn"
                onClick={saveSettings}
                disabled={saving}
                className="border border-[#00FF94] bg-[#00FF94]/10 text-[#00FF94] hover:bg-[#00FF94] hover:text-black transition-all uppercase tracking-wider text-[10px] font-bold px-4 py-1.5 flex items-center gap-2 disabled:opacity-50"
              >
                <Save size={12} />{saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {[
                { key: 'max_gas_price_gwei', label: 'Max Gas (Gwei)', step: '0.01' },
                { key: 'min_profit_threshold', label: 'Min Profit (ETH)', step: '0.0001' },
                { key: 'max_flash_loan_amount', label: 'Max Flash Loan (ETH)', step: '1' },
                { key: 'slippage_buffer', label: 'Slippage Buffer', step: '0.0001' },
                { key: 'scan_interval_ms', label: 'Scan Interval (ms)', step: '500' },
                { key: 'scan_amount', label: 'Scan Amount (ETH)', step: '0.1' },
                { key: 'profit_threshold', label: 'Profit Threshold', step: '0.01' },
                { key: 'z_score_threshold', label: 'Z-Score Threshold', step: '0.1' },
              ].map(({ key, label, step }) => (
                <div key={key}>
                  <label className="text-[10px] uppercase tracking-widest text-[#737373] block mb-1">{label}</label>
                  <input
                    data-testid={`setting-${key}`}
                    type="number"
                    step={step}
                    value={editSettings[key] ?? ''}
                    onChange={(e) => setEditSettings({ ...editSettings, [key]: e.target.value })}
                    className="w-full bg-transparent border-0 border-b border-[#333] focus:border-[#00FF94] focus:outline-none px-0 py-1.5 font-mono text-sm text-white"
                  />
                </div>
              ))}
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    data-testid="setting-bot-active"
                    type="checkbox"
                    checked={editSettings.bot_active ?? true}
                    onChange={(e) => setEditSettings({ ...editSettings, bot_active: e.target.checked })}
                    className="w-4 h-4 accent-[#00FF94]"
                  />
                  <span className="text-[10px] uppercase tracking-widest text-[#737373]">Bot Active</span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* CONTENT AREA */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-3 gap-px bg-[#333]">
          {/* LEFT: Tables */}
          <div className="lg:col-span-2 bg-[#050505] flex flex-col overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-[#333] shrink-0">
              {['opportunities', 'trades'].map(tab => (
                <button
                  key={tab}
                  data-testid={`tab-${tab}`}
                  onClick={() => setActiveTab(tab)}
                  className={`px-5 py-2.5 text-[10px] uppercase tracking-widest font-bold transition-all border-b-2 ${
                    activeTab === tab
                      ? 'text-[#00FF94] border-[#00FF94] bg-[#00FF94]/5'
                      : 'text-[#737373] border-transparent hover:text-white'
                  }`}
                >
                  {tab === 'opportunities' ? <Eye size={12} className="inline mr-1.5" /> : <Activity size={12} className="inline mr-1.5" />}
                  {tab}
                </button>
              ))}
              <div className="ml-auto pr-4 flex items-center text-[10px] text-[#737373] font-mono">
                {lastRefresh && `Updated ${formatTime(lastRefresh.toISOString())}`}
              </div>
            </div>

            {/* Table Content */}
            <div className="flex-1 overflow-auto">
              {activeTab === 'opportunities' && (
                <table data-testid="opportunities-table" className="w-full text-xs font-mono">
                  <thead className="sticky top-0 bg-[#0A0A0A] z-10">
                    <tr className="text-[#737373] uppercase text-[10px] tracking-wider border-b border-[#333]">
                      <th className="text-left py-2 px-3 font-normal">Time</th>
                      <th className="text-left py-2 px-3 font-normal">Path</th>
                      <th className="text-left py-2 px-3 font-normal">DEXes</th>
                      <th className="text-right py-2 px-3 font-normal">Flash Loan</th>
                      <th className="text-right py-2 px-3 font-normal">Est. Profit</th>
                      <th className="text-right py-2 px-3 font-normal">Gas Est.</th>
                      <th className="text-center py-2 px-3 font-normal">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {opportunities.map((opp, i) => (
                      <tr key={i} className="border-b border-[#333]/50 hover:bg-white/5 transition-colors">
                        <td className="py-2 px-3 text-[#737373]">{formatTime(opp.detected_at)}</td>
                        <td className="py-2 px-3 text-[#00FFFF]">{opp.path}</td>
                        <td className="py-2 px-3 text-[#737373]">{opp.dexes}</td>
                        <td className="py-2 px-3 text-right">{opp.flash_loan_amount} {opp.flash_loan_asset}</td>
                        <td className="py-2 px-3 text-right text-[#00FF94]">{opp.estimated_profit} ETH</td>
                        <td className="py-2 px-3 text-right text-[#737373]">{opp.gas_cost_estimate}</td>
                        <td className="py-2 px-3 text-center"><StatusBadge status={opp.status} /></td>
                      </tr>
                    ))}
                    {opportunities.length === 0 && (
                      <tr><td colSpan={7} className="py-8 text-center text-[#737373]">No opportunities detected</td></tr>
                    )}
                  </tbody>
                </table>
              )}

              {activeTab === 'trades' && (
                <table data-testid="trades-table" className="w-full text-xs font-mono">
                  <thead className="sticky top-0 bg-[#0A0A0A] z-10">
                    <tr className="text-[#737373] uppercase text-[10px] tracking-wider border-b border-[#333]">
                      <th className="text-left py-2 px-3 font-normal">Time</th>
                      <th className="text-left py-2 px-3 font-normal">Path</th>
                      <th className="text-right py-2 px-3 font-normal">Loan</th>
                      <th className="text-right py-2 px-3 font-normal">Profit</th>
                      <th className="text-right py-2 px-3 font-normal">USD</th>
                      <th className="text-right py-2 px-3 font-normal">Gas</th>
                      <th className="text-left py-2 px-3 font-normal">TX Hash</th>
                      <th className="text-center py-2 px-3 font-normal">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.map((trade, i) => {
                      const p = parseFloat(trade.profit);
                      return (
                        <tr key={i} className="border-b border-[#333]/50 hover:bg-white/5 transition-colors">
                          <td className="py-2 px-3 text-[#737373]">{formatTime(trade.executed_at)}</td>
                          <td className="py-2 px-3 text-[#00FFFF]">{trade.path}</td>
                          <td className="py-2 px-3 text-right">{trade.flash_loan_amount}</td>
                          <td className={`py-2 px-3 text-right ${p >= 0 ? 'text-[#00FF94]' : 'text-[#FF0055]'}`}>
                            {p >= 0 ? '+' : ''}{trade.profit}
                          </td>
                          <td className={`py-2 px-3 text-right ${p >= 0 ? 'text-[#00FF94]' : 'text-[#FF0055]'}`}>
                            ${trade.profit_usd}
                          </td>
                          <td className="py-2 px-3 text-right text-[#737373]">{trade.gas_cost}</td>
                          <td className="py-2 px-3">
                            <a
                              href={`https://basescan.org/tx/${trade.tx_hash}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[#FF00FF] hover:underline"
                            >
                              {truncateHash(trade.tx_hash)}
                            </a>
                          </td>
                          <td className="py-2 px-3 text-center"><StatusBadge status={trade.status} /></td>
                        </tr>
                      );
                    })}
                    {trades.length === 0 && (
                      <tr><td colSpan={8} className="py-8 text-center text-[#737373]">No trades executed</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* RIGHT: Logs */}
          <div data-testid="logs-panel" className="bg-[#050505] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#333] shrink-0">
              <div className="flex items-center gap-2">
                <Terminal size={14} className="text-[#00FF94]" />
                <span className="text-[10px] uppercase tracking-widest font-bold text-[#737373]">Live Logs</span>
              </div>
              <span className="text-[10px] text-[#737373] font-mono">{logs.length} entries</span>
            </div>
            <div ref={logsRef} className="flex-1 overflow-auto bg-[#050505] py-1">
              {logs.map((log, i) => <LogLine key={i} log={log} />)}
              {logs.length === 0 && (
                <div className="p-4 text-center text-[#737373] text-xs">No logs available</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <footer className="border-t border-[#333] bg-[#0A0A0A] px-6 py-1.5 flex items-center justify-between text-[10px] text-[#737373] font-mono shrink-0">
        <div className="flex items-center gap-4">
          <span>AAVE V3 Flash Loans</span>
          <span className="text-[#333]">|</span>
          <span>Base Mainnet</span>
          <span className="text-[#333]">|</span>
          <span>{status?.paths_loaded || 0} Paths Loaded</span>
        </div>
        <div className="flex items-center gap-4">
          <span>Scans: {status?.scans_count || 0}</span>
          <span className="text-[#333]">|</span>
          <span>Last: {status?.last_scan_at ? formatTime(status.last_scan_at) : '--'}</span>
        </div>
      </footer>
    </div>
  );
}

export default App;

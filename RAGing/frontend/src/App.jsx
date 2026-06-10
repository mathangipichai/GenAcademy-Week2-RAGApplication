import React, { useState, useEffect, useRef } from 'react';

const API_BASE = window.location.port === '5173' ? 'http://localhost:8000' : '';

function App() {
  const [view, setView] = useState('chat'); // 'chat' or 'dashboard'
  const [dashboardTab, setDashboardTab] = useState('telemetry'); // 'telemetry', 'files', 'config'
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedCity, setSelectedCity] = useState('');
  const [allResources, setAllResources] = useState({});
  const [activeCitations, setActiveCitations] = useState([]);
  const [pipelineData, setPipelineData] = useState(null);
  const chatFeedRef = useRef(null);

  // RAG Studio states
  const [studioGoal, setStudioGoal] = useState({
    user: 'Texas Renters',
    questionType: 'City Codes and Ordinances',
    corpus: 'Texas Property Code Chapter 92 and local city ordinances',
    surface: 'Web App Chatbot',
    faithfulness: '95',
    relevance: '90'
  });
  
  const [studioConfig, setStudioConfig] = useState({
    chunkSize: 1000,
    chunkOverlap: 150,
    denseWeight: 0.6,
    sparseWeight: 0.4,
    embeddingsModel: 'sentence-transformers/all-MiniLM-L6-v2 (Local)',
    llmModel: 'Mock Renter Agent LLM (Dry Run)',
    routingThreshold: 'litigation/sue/court keywords',
    description: 'RAG Studio Run',
    sourcingMode: 'local',
    sourcingEndpoint: 'https://statutes.capitol.texas.gov/api/v1/prop/92',
    cacheEnabled: true,
    stripMarkdown: true,
    normalizeWhitespace: true,
    decodeHtml: true,
    removeLegalBoilerplate: false
  });

  const [studioRunning, setStudioRunning] = useState(false);
  const [studioLogs, setStudioLogs] = useState('');
  const [activeWorkflowNode, setActiveWorkflowNode] = useState(null);

  // Connection states
  const [connectionKeys, setConnectionKeys] = useState({ openai: '', nebius: '', gemini: '' });
  const [connectionStatuses, setConnectionStatuses] = useState({ openai: 'not_configured', nebius: 'not_configured', gemini: 'not_configured' });
  const [connectionTesting, setConnectionTesting] = useState({ openai: false, nebius: false, gemini: false });
  const [connectionResults, setConnectionResults] = useState({ openai: null, nebius: null, gemini: null });

  const fetchConnectionsStatus = () => {
    fetch(`${API_BASE}/api/connections`)
      .then(res => res.json())
      .then(data => setConnectionStatuses(data))
      .catch(err => console.error("Failed to load connection statuses:", err));
  };

  // Suggested questions based on our dataset
  const suggestedQuestions = [
    { text: "What is the AC cooling standard in Dallas?", city: "Dallas" },
    { text: "What are the winter heating rules in Aubrey?", city: "Aubrey" },
    { text: "How do I get my security deposit back in Texas?", city: "" },
    { text: "Are there mold regulations in Houston?", city: "Houston" },
  ];

  // Fetch resources on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/resources`)
      .then(res => res.json())
      .then(data => setAllResources(data))
      .catch(err => console.error("Failed to load local resources:", err));
    fetchConnectionsStatus();
  }, []);

  // Auto-scroll chat feed
  useEffect(() => {
    if (chatFeedRef.current) {
      chatFeedRef.current.scrollTop = chatFeedRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const fetchPipelineData = () => {
    fetch(`${API_BASE}/api/pipeline/dashboard`)
      .then(res => res.json())
      .then(data => {
        setPipelineData(data);
        if (data.config) {
          setStudioConfig(prev => ({
            ...prev,
            chunkSize: data.config.chunk_size || 1000,
            chunkOverlap: data.config.chunk_overlap || 150,
            denseWeight: data.config.dense_search_weight || 0.6,
            sparseWeight: data.config.sparse_search_weight || 0.4,
            embeddingsModel: data.config.embeddings_model || 'sentence-transformers/all-MiniLM-L6-v2 (Local)',
            llmModel: data.config.llm_model || 'Mock Renter Agent LLM (Dry Run)',
            routingThreshold: data.config.routing_threshold || 'litigation/sue/court keywords'
          }));
        }
        fetchConnectionsStatus();
      })
      .catch(err => console.error("Failed to load pipeline stats:", err));
  };

  const handleSend = async (textToSend) => {
    const text = textToSend || input;
    if (!text.trim()) return;

    const userMessage = {
      id: Date.now(),
      sender: 'user',
      text: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });

      if (!response.ok) {
        throw new Error('API request failed');
      }

      const data = await response.json();
      
      const botMessage = {
        id: Date.now() + 1,
        sender: 'bot',
        text: data.response,
        status: data.status,
        citations: data.citations,
        city: data.city,
        county: data.county,
        topic: data.topic,
        model_provider: data.model_provider,
        model_name: data.model_name,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages(prev => [...prev, botMessage]);
      if (data.citations && data.citations.length > 0) {
        setActiveCitations(data.citations);
      }
      if (data.city) {
        setSelectedCity(data.city);
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        sender: 'bot',
        text: '⚠️ I had trouble connecting to the server. Please check that the Python FastAPI backend is running on port 8000.',
        status: 'error',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'answered_local':
        return <span className="status-badge local">Local Codes Applied</span>;
      case 'answered_fallback_state':
        return <span className="status-badge fallback">Texas State Law Fallback</span>;
      case 'escalated_legal':
        return <span className="status-badge escalated">Legal Escalation</span>;
      default:
        return null;
    }
  };

  const getActiveModelName = () => {
    if (connectionStatuses.nebius === 'configured') {
      return { provider: 'Nebius', model: 'meta-llama/Llama-3.3-70B' };
    } else if (connectionStatuses.openai === 'configured') {
      return { provider: 'OpenAI', model: 'gpt-4o-mini' };
    } else {
      return { provider: 'Local Mock', model: 'Mock Renter Agent LLM' };
    }
  };

  const getDisplayResources = () => {
    const resources = [];
    if (allResources['Statewide']) {
      resources.push(...allResources['Statewide']);
    }
    if (selectedCity && allResources[selectedCity]) {
      resources.unshift(...allResources[selectedCity]);
    }
    return resources;
  };

  const executeStudioRun = async () => {
    if (studioRunning) return;
    
    setStudioRunning(true);
    setStudioLogs('Initializing RAG Studio End-to-End Workflow...\n\n');
    
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    
    setActiveWorkflowNode('sourcing');
    setStudioLogs(prev => prev + `[1/8] Data Sourcing Node: Checking download cache and syncing Texas Property Code statutory sources (Mode: ${studioConfig.sourcingMode.toUpperCase()})...\n`);
    await sleep(800);
    
    setActiveWorkflowNode('prep');
    setStudioLogs(prev => prev + `[2/8] Data Prep Node: Cleaning text, normalizing whitespaces, stripping markdown tags, and conditioning raw data...\n`);
    await sleep(800);
    
    setActiveWorkflowNode('ingest');
    setStudioLogs(prev => prev + '[3/8] Ingestion Node: Loading raw markdown documents from knowledge base...\n');
    await sleep(800);
    
    setActiveWorkflowNode('chunk');
    setStudioLogs(prev => prev + `[4/8] Chunking Node: Parsing header structures, generating ${studioConfig.chunkSize}-char chunks (overlap: ${studioConfig.chunkOverlap})...\n`);
    await sleep(800);
    
    setActiveWorkflowNode('db');
    setStudioLogs(prev => prev + `[5/8] Vector DB Node: Launching embeddings vector store indexer...\n`);
    await sleep(400);
    
    setStudioLogs(prev => prev + `>> Sending configuration to FastAPI server backend...\n`);
    
    try {
      const response = await fetch(`${API_BASE}/api/pipeline/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chunk_size: parseInt(studioConfig.chunkSize),
          chunk_overlap: parseInt(studioConfig.chunkOverlap),
          dense_search_weight: parseFloat(studioConfig.denseWeight),
          sparse_search_weight: parseFloat(1 - studioConfig.denseWeight),
          embeddings_model: studioConfig.embeddingsModel,
          llm_model: studioConfig.llmModel,
          routing_threshold: studioConfig.routingThreshold,
          description: studioConfig.description || `Studio Run: size=${studioConfig.chunkSize}`,
          sourcing_mode: studioConfig.sourcingMode,
          sourcing_endpoint: studioConfig.sourcingEndpoint,
          cache_enabled: studioConfig.cacheEnabled,
          strip_markdown: studioConfig.stripMarkdown,
          normalize_whitespace: studioConfig.normalizeWhitespace,
          decode_html: studioConfig.decodeHtml,
          remove_legal_boilerplate: studioConfig.removeLegalBoilerplate
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        setActiveWorkflowNode('db');
        setStudioLogs(prev => prev + `[✓] Vector DB Node: Chroma DB indexed and persisted successfully.\n`);
        await sleep(600);
        
        setActiveWorkflowNode('retrieve');
        setStudioLogs(prev => prev + `[6/8] Hybrid Retriever Node: Blending Dense (${(studioConfig.denseWeight * 100).toFixed(0)}%) and Sparse (${((1 - studioConfig.denseWeight) * 100).toFixed(0)}%) search ranks...\n`);
        await sleep(600);
        
        setActiveWorkflowNode('graph');
        setStudioLogs(prev => prev + `[7/8] LangGraph Routing Node: Validating state logic, routing audit rules...\n`);
        await sleep(600);
        
        setActiveWorkflowNode('eval');
        setStudioLogs(prev => prev + `[8/8] Evaluation Auditor Node: Triggering 20 benchmark queries...\n`);
        await sleep(600);
        
        setStudioLogs(prev => prev + '\n' + result.logs + '\n\n');
        
        if (result.latest_run) {
          setStudioLogs(prev => prev + `==================================================\n`);
          setStudioLogs(prev => prev + `🏆 RUN COMPLETED SUCCESSFULLY!\n`);
          setStudioLogs(prev => prev + `Accuracy: ${result.latest_run.accuracy.toFixed(1)}% (${result.latest_run.passed_cases}/${result.latest_run.total_cases} passed)\n`);
          setStudioLogs(prev => prev + `==================================================\n`);
        }
        
        fetchPipelineData();
      } else {
        setStudioLogs(prev => prev + `\n❌ EXECUTION FAILED:\n${result.error}\n\n${result.logs}\n`);
      }
    } catch (err) {
      setStudioLogs(prev => prev + `\n❌ NETWORK ERROR: Failed to invoke backend API: ${err.message}\n`);
    } finally {
      setStudioRunning(false);
      setActiveWorkflowNode(null);
    }
  };

  const handleTestConnection = async (provider) => {
    const key = connectionKeys[provider];
    if (!key.trim()) {
      setConnectionResults(prev => ({ ...prev, [provider]: { success: false, message: 'Please enter an API key to test.' } }));
      return;
    }

    setConnectionTesting(prev => ({ ...prev, [provider]: true }));
    setConnectionResults(prev => ({ ...prev, [provider]: null }));

    try {
      const response = await fetch(`${API_BASE}/api/connections/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, api_key: key })
      });
      const data = await response.json();
      if (data.success) {
        setConnectionResults(prev => ({ ...prev, [provider]: { success: true, message: data.message } }));
      } else {
        setConnectionResults(prev => ({ ...prev, [provider]: { success: false, message: data.error } }));
      }
    } catch (err) {
      setConnectionResults(prev => ({ ...prev, [provider]: { success: false, message: `Network Error: ${err.message}` } }));
    } finally {
      setConnectionTesting(prev => ({ ...prev, [provider]: false }));
    }
  };

  const handleSaveConnection = async (provider) => {
    const key = connectionKeys[provider];
    if (!key.trim()) {
      setConnectionResults(prev => ({ ...prev, [provider]: { success: false, message: 'Please enter an API key to save.' } }));
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/connections/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, api_key: key })
      });
      const data = await response.json();
      if (data.success) {
        setConnectionResults(prev => ({ ...prev, [provider]: { success: true, message: data.message } }));
        setConnectionKeys(prev => ({ ...prev, [provider]: '' })); // Clear input field
        fetchConnectionsStatus(); // Reload status
      } else {
        setConnectionResults(prev => ({ ...prev, [provider]: { success: false, message: data.error || 'Failed to save.' } }));
      }
    } catch (err) {
      setConnectionResults(prev => ({ ...prev, [provider]: { success: false, message: `Network Error: ${err.message}` } }));
    }
  };


  return (
    <div className={`app-container ${view !== 'chat' ? 'dashboard-mode' : ''}`} style={view !== 'chat' ? { gridTemplateColumns: '1fr' } : {}}>
      <div className="chat-section">
        <div className="chat-header">
          <div className="brand">
            <span className="brand-logo">🤠</span>
            <div className="brand-text">
              <h1>Texas Tenant Guide</h1>
              <p>RAG Legal Info Navigator</p>
            </div>
            
            {/* Main Tabs Selector */}
            <div className="main-nav-tabs">
              <button 
                className={`nav-tab-btn ${view === 'chat' ? 'active' : ''}`}
                onClick={() => setView('chat')}
              >
                💬 RAG Chat
              </button>
              <button 
                className={`nav-tab-btn ${view === 'studio' ? 'active' : ''}`}
                onClick={() => {
                  setView('studio');
                  fetchPipelineData();
                }}
              >
                ⚙️ RAG Studio
              </button>
              <button 
                className={`nav-tab-btn ${view === 'dashboard' ? 'active' : ''}`}
                onClick={() => {
                  setView('dashboard');
                  fetchPipelineData();
                }}
              >
                📊 Dashboard
              </button>
            </div>
          </div>
          
          {view === 'chat' && (
            <div className="location-selector">
              <select 
                value={selectedCity} 
                onChange={(e) => setSelectedCity(e.target.value)}
              >
                <option value="">All Texas Cities</option>
                <option value="Austin">Austin (Travis County)</option>
                <option value="Dallas">Dallas (Dallas County)</option>
                <option value="Houston">Houston (Harris County)</option>
                <option value="San Antonio">San Antonio (Bexar County)</option>
                <option value="Plano">Plano (Collin County)</option>
                <option value="Frisco">Frisco (Collin & Denton)</option>
                <option value="Aubrey">Aubrey (Denton County)</option>
              </select>
            </div>
          )}
        </div>

        {/* VIEW 1: RAG CHAT BOT */}
        {view === 'chat' && (
          <>
            {messages.length === 0 ? (
              <div className="welcome-screen">
                <div className="welcome-logo">📖</div>
                <h2>Texas Renter Rights Guide</h2>
                <p>
                  Ask about local tenant protection rules, landlord repair duties, air conditioning mandates, security deposits, and legal advocacy resources. Select a city or simply start typing.
                </p>
                <div className="suggested-questions">
                  {suggestedQuestions.map((q, idx) => (
                    <button 
                      key={idx} 
                      className="suggested-btn"
                      onClick={() => {
                        if (q.city) setSelectedCity(q.city);
                        handleSend(q.text);
                      }}
                    >
                      {q.text}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="chat-feed" ref={chatFeedRef}>
                {messages.map((msg) => (
                  <div key={msg.id} className={`message-wrapper ${msg.sender}`}>
                    <div className="message-bubble">
                      {msg.text.split('\n').map((line, lIdx) => {
                        if (line.startsWith('###')) {
                          return <h3 key={lIdx} style={{margin: '12px 0 6px 0', fontSize: '16px'}}>{line.replace('###', '')}</h3>;
                        }
                        if (line.startsWith('-') || line.startsWith('*')) {
                          return <li key={lIdx} style={{marginLeft: '20px', listStyleType: 'square'}}>{line.substring(1).trim()}</li>;
                        }
                        return <p key={lIdx} style={{marginBottom: '8px'}}>{line}</p>;
                      })}

                      {msg.sender === 'bot' && msg.citations && msg.citations.length > 0 && (
                        <div className="message-citations" style={{
                          marginTop: '16px',
                          paddingTop: '12px',
                          borderTop: '1px solid var(--border-glass)',
                        }}>
                          <div style={{
                            fontSize: '11px',
                            textTransform: 'uppercase',
                            letterSpacing: '1px',
                            color: 'var(--text-secondary)',
                            marginBottom: '10px',
                            fontWeight: '600',
                          }}>
                            📚 Cited References
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {msg.citations.map((c) => (
                              <div key={c.index} className="citation-card" style={{ padding: '10px', background: 'rgba(255, 255, 255, 0.01)' }}>
                                <div className="citation-header" style={{ marginBottom: '4px' }}>
                                  <span className="scope">[{c.index}] {c.scope} level</span>
                                  <span className="location">{c.location}</span>
                                </div>
                                <div className="citation-section" style={{ fontSize: '12px', marginBottom: '6px' }}>{c.section}</div>
                                <div className="citation-snippet" style={{ fontSize: '11.5px', padding: '6px' }}>{c.snippet}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="message-meta">
                      <span>{msg.timestamp}</span>
                      {msg.sender === 'bot' && getStatusBadge(msg.status)}
                      {msg.sender === 'bot' && msg.model_provider && (
                        <span className="status-badge" style={{ 
                          marginLeft: 'auto',
                          background: 'rgba(255, 255, 255, 0.03)',
                          border: '1px solid var(--border-glass)',
                          color: 'var(--text-secondary)',
                          fontSize: '10px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          🤖 {msg.model_provider} ({msg.model_name})
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="message-wrapper bot">
                    <div className="message-bubble" style={{padding: '12px 16px', minWidth: '240px'}}>
                      <div className="typing-indicator" style={{ marginBottom: '8px' }}>
                        <span></span>
                        <span></span>
                        <span></span>
                      </div>
                      <div style={{
                        fontSize: '11px',
                        color: 'var(--text-secondary)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: 'rgba(59, 130, 246, 0.08)',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        border: '1px dashed rgba(59, 130, 246, 0.2)'
                      }}>
                        <span className="api-call-pulse" style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          background: '#10b981',
                          display: 'inline-block'
                        }}></span>
                        <span>
                          API Call: Requesting {getActiveModelName().provider === 'Local Mock' ? 'Local / Mock LLM' : `Model API via ${getActiveModelName().provider}`} ({getActiveModelName().model})
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="chat-input-area">
              <form onSubmit={(e) => { e.preventDefault(); handleSend(); }}>
                <div className="input-container">
                  <input 
                    type="text" 
                    value={input} 
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask about cooling laws, deposits, repair orders..." 
                    disabled={loading}
                  />
                  <button 
                    type="submit" 
                    className="send-btn" 
                    disabled={loading || !input.trim()}
                  >
                    Send
                  </button>
                </div>
              </form>
            </div>
          </>
        )}

        {/* VIEW 2: RAG STUDIO WORKFLOW PLANNER */}
        {view === 'studio' && (
          <div className="dashboard-content">
            
            {/* Header */}
            <div className="dashboard-intro">
              <div>
                <h2>⚙️ RAG Studio: End-to-End Workflow Planner</h2>
                <p className="dashboard-subtext">
                  Scope your RAG application using the educational bootcamp framework, customize hyperparameters, and execute the ingestion & evaluation pipeline.
                </p>
              </div>
            </div>

            {/* Split layout */}
            <div className="dashboard-grid" style={{ gridTemplateColumns: '1fr 1.2fr' }}>
              
              {/* Left Column: Forms */}
              <div className="dashboard-col">
                
                {/* 1. Goal Planner */}
                <div className="dashboard-card">
                  <h3 className="card-title">📖 Part 1: Scope Your RAG Goal (One-Liner Builder)</h3>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div className="form-group">
                        <label className="form-label">Target User</label>
                        <input 
                          type="text"
                          className="form-input"
                          value={studioGoal.user}
                          onChange={(e) => setStudioGoal({...studioGoal, user: e.target.value})}
                          placeholder="e.g. Texas Renters"
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Question Type</label>
                        <input 
                          type="text"
                          className="form-input"
                          value={studioGoal.questionType}
                          onChange={(e) => setStudioGoal({...studioGoal, questionType: e.target.value})}
                          placeholder="e.g. City Codes"
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Knowledge Corpus Description</label>
                      <input 
                        type="text"
                        className="form-input"
                        value={studioGoal.corpus}
                        onChange={(e) => setStudioGoal({...studioGoal, corpus: e.target.value})}
                        placeholder="e.g. Dallas municipal codes and state laws"
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.9fr 0.9fr', gap: '12px' }}>
                      <div className="form-group">
                        <label className="form-label">Surface / Platform</label>
                        <input 
                          type="text"
                          className="form-input"
                          value={studioGoal.surface}
                          onChange={(e) => setStudioGoal({...studioGoal, surface: e.target.value})}
                          placeholder="e.g. Web App Chatbot"
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Faithfulness %</label>
                        <input 
                          type="number"
                          className="form-input"
                          value={studioGoal.faithfulness}
                          onChange={(e) => setStudioGoal({...studioGoal, faithfulness: e.target.value})}
                          placeholder="95"
                          min="0" max="100"
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Relevance %</label>
                        <input 
                          type="number"
                          className="form-input"
                          value={studioGoal.relevance}
                          onChange={(e) => setStudioGoal({...studioGoal, relevance: e.target.value})}
                          placeholder="90"
                          min="0" max="100"
                        />
                      </div>
                    </div>

                    {/* Preview Box */}
                    <div className="one-liner-preview">
                      <strong className="preview-label">Live RAG Framework One-Liner Summary:</strong>
                      <p className="preview-text">
                        "My RAG app helps <span>{studioGoal.user || '[USER]'}</span> answer <span>{studioGoal.questionType || '[QUESTION TYPE]'}</span> from <span>{studioGoal.corpus || '[KNOWLEDGE CORPUS]'}</span> in <span>{studioGoal.surface || '[SURFACE]'}</span> with <span>{studioGoal.faithfulness || '[%]'}%</span> faithfulness and/or <span>{studioGoal.relevance || '[%]'}%</span> relevance."
                      </p>
                    </div>
                  </div>
                </div>

                {/* 1.5. Data Sourcing & Preparation Controls */}
                <div className="dashboard-card">
                  <h3 className="card-title">📡 Part 1.5: Data Sourcing & Preparation Controls</h3>
                  
                  <div className="config-params-list" style={{ gap: '12px' }}>
                    {/* Sourcing Mode */}
                    <div className="form-group">
                      <label className="form-label">Data Sourcing Mode</label>
                      <select 
                        className="form-select"
                        value={studioConfig.sourcingMode}
                        onChange={(e) => setStudioConfig({...studioConfig, sourcingMode: e.target.value})}
                      >
                        <option value="local">Local Filesystem Cache (data/knowledge_base)</option>
                        <option value="web_scrape">Web Scrape Municipal Codes (Live Crawler)</option>
                        <option value="api_sync">API Data Sync (Texas Statutes Portal API)</option>
                      </select>
                    </div>

                    {/* Sourcing Endpoint */}
                    {studioConfig.sourcingMode !== 'local' && (
                      <div className="form-group">
                        <label className="form-label">Sourcing Endpoint URL / Target Portal</label>
                        <input 
                          type="text" 
                          className="form-input" 
                          value={studioConfig.sourcingEndpoint}
                          onChange={(e) => setStudioConfig({...studioConfig, sourcingEndpoint: e.target.value})}
                          placeholder="https://..."
                        />
                      </div>
                    )}

                    {/* Download caching */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '4px 0' }}>
                      <input 
                        type="checkbox" 
                        id="cacheEnabled"
                        checked={studioConfig.cacheEnabled}
                        onChange={(e) => setStudioConfig({...studioConfig, cacheEnabled: e.target.checked})}
                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                      <label htmlFor="cacheEnabled" style={{ fontSize: '12.5px', color: 'var(--text-muted)', cursor: 'pointer' }}>
                        Enable Source Download Caching (Speeds up repeated runs)
                      </label>
                    </div>

                    <div style={{ borderBottom: '1px solid var(--border-glass)', margin: '8px 0' }}></div>

                    {/* Data Prep options */}
                    <label className="form-label">Data Prep & Conditioning Rules</label>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input 
                          type="checkbox" 
                          id="stripMarkdown"
                          checked={studioConfig.stripMarkdown}
                          onChange={(e) => setStudioConfig({...studioConfig, stripMarkdown: e.target.checked})}
                          style={{ width: '15px', height: '15px', cursor: 'pointer' }}
                        />
                        <label htmlFor="stripMarkdown" style={{ fontSize: '12.5px', color: 'var(--text-muted)', cursor: 'pointer' }}>
                          Strip markdown tags & structural syntax
                        </label>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input 
                          type="checkbox" 
                          id="normalizeWhitespace"
                          checked={studioConfig.normalizeWhitespace}
                          onChange={(e) => setStudioConfig({...studioConfig, normalizeWhitespace: e.target.checked})}
                          style={{ width: '15px', height: '15px', cursor: 'pointer' }}
                        />
                        <label htmlFor="normalizeWhitespace" style={{ fontSize: '12.5px', color: 'var(--text-muted)', cursor: 'pointer' }}>
                          Normalize whitespaces, tabs & blank lines
                        </label>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input 
                          type="checkbox" 
                          id="decodeHtml"
                          checked={studioConfig.decodeHtml}
                          onChange={(e) => setStudioConfig({...studioConfig, decodeHtml: e.target.checked})}
                          style={{ width: '15px', height: '15px', cursor: 'pointer' }}
                        />
                        <label htmlFor="decodeHtml" style={{ fontSize: '12.5px', color: 'var(--text-muted)', cursor: 'pointer' }}>
                          Decode HTML character entities (e.g. &amp;rarr; &amp;sect;)
                        </label>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input 
                          type="checkbox" 
                          id="removeLegalBoilerplate"
                          checked={studioConfig.removeLegalBoilerplate}
                          onChange={(e) => setStudioConfig({...studioConfig, removeLegalBoilerplate: e.target.checked})}
                          style={{ width: '15px', height: '15px', cursor: 'pointer' }}
                        />
                        <label htmlFor="removeLegalBoilerplate" style={{ fontSize: '12.5px', color: 'var(--text-muted)', cursor: 'pointer' }}>
                          Remove standard legal disclaimers boilerplate
                        </label>
                      </div>
                    </div>

                  </div>
                </div>

                {/* 2. Hyperparameters */}
                <div className="dashboard-card">
                  <h3 className="card-title">⚙️ Part 2: Hyperparameters Configurations</h3>
                  
                  <div className="config-params-list">
                    {/* Chunk size */}
                    <div className="config-param-item">
                      <div className="param-header">
                        <span>Ingestion Chunk Size</span>
                        <span className="param-value">{studioConfig.chunkSize} chars</span>
                      </div>
                      <input 
                        type="range" 
                        min="200" 
                        max="2000" 
                        step="100"
                        value={studioConfig.chunkSize}
                        onChange={(e) => setStudioConfig({...studioConfig, chunkSize: parseInt(e.target.value)})}
                        className="studio-slider"
                      />
                    </div>

                    {/* Chunk overlap */}
                    <div className="config-param-item">
                      <div className="param-header">
                        <span>Chunk Overlap</span>
                        <span className="param-value">{studioConfig.chunkOverlap} chars</span>
                      </div>
                      <input 
                        type="range" 
                        min="50" 
                        max="500" 
                        step="25"
                        value={studioConfig.chunkOverlap}
                        onChange={(e) => setStudioConfig({...studioConfig, chunkOverlap: parseInt(e.target.value)})}
                        className="studio-slider"
                      />
                    </div>

                    {/* Search blending */}
                    <div className="config-param-item">
                      <div className="param-header">
                        <span>Hybrid Blending (Vector Weight vs BM25 Keyword)</span>
                        <span className="param-value">
                          {(studioConfig.denseWeight * 100).toFixed(0)}% Vector / {((1 - studioConfig.denseWeight) * 100).toFixed(0)}% BM25
                        </span>
                      </div>
                      <input 
                        type="range" 
                        min="0.0" 
                        max="1.0" 
                        step="0.05"
                        value={studioConfig.denseWeight}
                        onChange={(e) => setStudioConfig({...studioConfig, denseWeight: parseFloat(e.target.value)})}
                        className="studio-slider"
                      />
                    </div>

                    {/* Routing rules */}
                    <div className="form-group">
                      <label className="form-label">Escalation Routing Keywords</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        value={studioConfig.routingThreshold}
                        onChange={(e) => setStudioConfig({...studioConfig, routingThreshold: e.target.value})}
                        placeholder="e.g. litigation, sue, court, attorney"
                      />
                    </div>

                    {/* Active models */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div className="form-group">
                        <label className="form-label">Embedding Model</label>
                        <select 
                          className="form-select"
                          value={studioConfig.embeddingsModel}
                          onChange={(e) => setStudioConfig({...studioConfig, embeddingsModel: e.target.value})}
                        >
                          <option value="sentence-transformers/all-MiniLM-L6-v2 (Local)">all-MiniLM-L6-v2 (Local)</option>
                          <option value="BAAI/bge-en-icl (Nebius API)">bge-en-icl (Nebius API)</option>
                          <option value="text-embedding-3-small (OpenAI API)">text-embedding-3-small (OpenAI)</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Inference LLM</label>
                        <select 
                          className="form-select"
                          value={studioConfig.llmModel}
                          onChange={(e) => setStudioConfig({...studioConfig, llmModel: e.target.value})}
                        >
                          <option value="Mock Renter Agent LLM (Dry Run)">Mock Renter LLM (Dry Run)</option>
                          <option value="meta-llama/Llama-3.3-70B-Instruct (Nebius API)">Llama-3.3-70B (Nebius API)</option>
                          <option value="gpt-4o-mini (OpenAI API)">gpt-4o-mini (OpenAI API)</option>
                        </select>
                      </div>
                    </div>

                    {/* Description label for run */}
                    <div className="form-group" style={{ marginTop: '6px' }}>
                      <label className="form-label">Workflow Run Description</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        value={studioConfig.description}
                        onChange={(e) => setStudioConfig({...studioConfig, description: e.target.value})}
                        placeholder="e.g. Run with chunk size 800"
                      />
                    </div>

                  </div>
                </div>

              </div>

              {/* Right Column: Node Visualizer & Live logs */}
              <div className="dashboard-col">
                
                {/* 3. Visual Workflow Nodes Chart */}
                <div className="dashboard-card">
                  <h3 className="card-title">🔗 Part 3: Visual End-to-End Workflow Nodes</h3>
                  
                  <div className="workflow-nodes-container">
                    <div className={`workflow-node ${activeWorkflowNode === 'sourcing' ? 'active pulsing' : ''}`}>
                      <div className="node-icon">📡</div>
                      <div className="node-label">Sourcing</div>
                      <div className="node-sub">
                        {studioConfig.sourcingMode === 'local' ? 'Local Cache' : studioConfig.sourcingMode === 'web_scrape' ? 'Municipal Scraper' : 'Portal API'}
                      </div>
                    </div>

                    <div className="node-arrow">➡️</div>

                    <div className={`workflow-node ${activeWorkflowNode === 'prep' ? 'active pulsing' : ''}`}>
                      <div className="node-icon">🧹</div>
                      <div className="node-label">Data Prep</div>
                      <div className="node-sub">Clean & Norm</div>
                    </div>

                    <div className="node-arrow">➡️</div>

                    <div className={`workflow-node ${activeWorkflowNode === 'ingest' ? 'active pulsing' : ''}`}>
                      <div className="node-icon">📥</div>
                      <div className="node-label">Ingestion</div>
                      <div className="node-sub">Load Corpus</div>
                    </div>
                    
                    <div className="node-arrow">➡️</div>
                    
                    <div className={`workflow-node ${activeWorkflowNode === 'chunk' ? 'active pulsing' : ''}`}>
                      <div className="node-icon">✂️</div>
                      <div className="node-label">Chunker</div>
                      <div className="node-sub">{studioConfig.chunkSize} chars</div>
                    </div>
                  </div>

                  <div className="workflow-nodes-divider">⬇️</div>

                  <div className="workflow-nodes-container">
                    <div className={`workflow-node ${activeWorkflowNode === 'db' ? 'active pulsing' : ''}`}>
                      <div className="node-icon">💾</div>
                      <div className="node-label">Vector Store</div>
                      <div className="node-sub">Chroma DB</div>
                    </div>

                    <div className="node-arrow">➡️</div>

                    <div className={`workflow-node ${activeWorkflowNode === 'retrieve' ? 'active pulsing' : ''}`}>
                      <div className="node-icon">🔄</div>
                      <div className="node-label">Retriever</div>
                      <div className="node-sub">Hybrid Blended</div>
                    </div>
                    
                    <div className="node-arrow">➡️</div>
                    
                    <div className={`workflow-node ${activeWorkflowNode === 'graph' ? 'active pulsing' : ''}`}>
                      <div className="node-icon">🕸️</div>
                      <div className="node-label">LangGraph</div>
                      <div className="node-sub">State Router</div>
                    </div>
                    
                    <div className="node-arrow">➡️</div>
                    
                    <div className={`workflow-node ${activeWorkflowNode === 'eval' ? 'active pulsing' : ''}`}>
                      <div className="node-icon">🎯</div>
                      <div className="node-label">Auditor</div>
                      <div className="node-sub">Evaluation</div>
                    </div>
                  </div>

                  {/* Execute Button */}
                  <div style={{ marginTop: '32px', display: 'flex', justifyContent: 'center' }}>
                    <button 
                      className="execute-run-btn"
                      onClick={executeStudioRun}
                      disabled={studioRunning}
                    >
                      {studioRunning ? (
                        <>
                          <span className="spinner"></span> Running RAG Pipeline Workflow...
                        </>
                      ) : (
                        '🚀 Execute Workflow Run'
                      )}
                    </button>
                  </div>
                </div>

                {/* 4. Live Logs console */}
                <div className="dashboard-card" style={{ flex: '1', display: 'flex', flexDirection: 'column', minHeight: '300px' }}>
                  <h3 className="card-title">🖥️ Part 4: Live Execution Console Monitor</h3>
                  
                  <div className="console-monitor">
                    {studioLogs ? (
                      <pre>{studioLogs}</pre>
                    ) : (
                      <div style={{ color: 'var(--text-muted)', fontSize: '13px', display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: '200px' }}>
                        Console idle. Click 'Execute Workflow Run' to view logs live.
                      </div>
                    )}
                  </div>
                </div>

              </div>

            </div>

          </div>
        )}

        {/* VIEW 3: PIPELINE DASHBOARD */}
        {view === 'dashboard' && (
          <div className="dashboard-content">
            
            {/* Dashboard Header with Sub-tabs */}
            <div className="dashboard-intro">
              <div>
                <h2>⚙️ RAG Continuous Improvement Dashboard</h2>
                <p className="dashboard-subtext">
                  Monitor knowledge database coverage, evaluate pipeline run accuracy history, and discover local ordinance telemetry gaps.
                </p>
              </div>
              
              {/* SUB-TABS SELECTOR */}
              <div className="dashboard-tabs">
                <button 
                  onClick={() => setDashboardTab('telemetry')}
                  className={`dashboard-tab-btn ${dashboardTab === 'telemetry' ? 'active' : ''}`}
                >
                  📊 Telemetry & Runs
                </button>
                <button 
                  onClick={() => setDashboardTab('files')}
                  className={`dashboard-tab-btn ${dashboardTab === 'files' ? 'active' : ''}`}
                >
                  📁 Knowledge Base
                </button>
                <button 
                  onClick={() => setDashboardTab('config')}
                  className={`dashboard-tab-btn ${dashboardTab === 'config' ? 'active' : ''}`}
                >
                  ⚙️ Settings & Architecture
                </button>
                <button 
                  onClick={() => setDashboardTab('connections')}
                  className={`dashboard-tab-btn ${dashboardTab === 'connections' ? 'active' : ''}`}
                >
                  🔑 Model Provider Connections
                </button>
              </div>
            </div>

            {/* Metrics Row (Rendered on all dashboard tabs for context) */}
            {pipelineData && (
              <div className="metrics-grid">
                <div className="metric-card">
                  <div className="metric-label">Active Knowledge Files</div>
                  <div className="metric-value blue">{pipelineData.files?.length || 0}</div>
                </div>

                <div className="metric-card">
                  <div className="metric-label">Telemetry Gaps Detected</div>
                  <div className={`metric-value ${pipelineData.telemetry?.fallback_gaps?.length > 0 ? 'amber' : 'green'}`}>
                    {pipelineData.telemetry?.fallback_gaps?.length || 0}
                  </div>
                </div>

                <div className="metric-card">
                  <div className="metric-label">Latest Pipeline Accuracy</div>
                  <div className="metric-value green">
                    {pipelineData.runs_history?.length > 0 
                      ? `${pipelineData.runs_history[pipelineData.runs_history.length - 1].accuracy.toFixed(0)}%`
                      : '0%'
                    }
                  </div>
                </div>

                <div className="metric-card">
                  <div className="metric-label">Total Queries Telemetry</div>
                  <div className="metric-value">{pipelineData.telemetry?.total_queries || 0}</div>
                </div>
              </div>
            )}

            {/* TAB 1 CONTENT: TELEMETRY & RUNS */}
            {dashboardTab === 'telemetry' && pipelineData && (
              <div className="dashboard-grid">
                <div className="dashboard-col">
                  {/* Accuracy History */}
                  <div className="dashboard-card">
                    <h3 className="card-title">📈 RAG Accuracy History (Progression over successive runs)</h3>
                    <div className="run-list">
                      {pipelineData.runs_history?.map((run, idx) => (
                        <div key={idx} className="run-item">
                          <div className="run-item-header">
                            <div>
                              <strong className="run-title">{run.description}</strong>
                              <div className="run-timestamp">
                                {new Date(run.timestamp).toLocaleString()}
                              </div>
                            </div>
                            <span className={`run-accuracy-value ${run.accuracy === 100 ? 'success' : ''}`}>
                              {run.accuracy.toFixed(0)}% Accuracy ({run.passed_cases}/{run.total_cases} matches)
                            </span>
                          </div>
                          <div className="progress-bar-outer">
                            <div 
                              className={`progress-bar-inner ${run.accuracy === 100 ? 'success' : 'warning'}`}
                              style={{ width: `${run.accuracy}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Query logs feed */}
                  <div className="dashboard-card">
                    <h3 className="card-title">📜 Recent User Queries (Live Log Feed)</h3>
                    {pipelineData.telemetry?.recent_queries?.length === 0 ? (
                      <p className="empty-text">No search queries logged yet. Chat with the bot to create log history.</p>
                    ) : (
                      <div className="query-logs-feed">
                        {pipelineData.telemetry.recent_queries.slice().reverse().map((q, idx) => (
                          <div key={idx} className="query-log-item">
                            <div className="query-info">
                              <span className="query-text">
                                "{q.query}"
                              </span>
                              <span className="query-subtext">
                                Inferred: {q.city || 'Statewide'} | Topic: {q.topic}
                              </span>
                            </div>
                            <div className="query-status-col">
                              {getStatusBadge(q.status)}
                              <span className="query-time">
                                {new Date(q.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right column: Gaps alerts */}
                <div className="dashboard-col">
                  <div className="dashboard-card">
                    <h3 className="card-title">🚨 Telemetry Knowledge Gaps</h3>
                    
                    {pipelineData.telemetry?.fallback_gaps?.length === 0 ? (
                      <div className="alert-box success">
                        <span className="alert-icon">✅</span>
                        <div>
                          <strong className="alert-title">No gaps detected!</strong>
                          <p className="alert-description">All city-specific query telemetry successfully matches local rules in your database.</p>
                        </div>
                      </div>
                    ) : (
                      <div className="gaps-list">
                        <p className="gaps-intro">
                          Users searched for the following cities, but lack city-specific database files (resolved via general Texas State Law):
                        </p>
                        {pipelineData.telemetry.fallback_gaps.map((gap, idx) => (
                          <div key={idx} className="gap-item">
                            <strong className="gap-location">📍 {gap.city}</strong>
                            <span className="gap-badge">
                              {gap.count} Fallback{gap.count > 1 ? 's' : ''}
                            </span>
                          </div>
                        ))}
                        <div className="gap-action-tip">
                          💡 <em>Action Item: Create a file named `data/knowledge_base/&lt;city_lowercase&gt;.md` and run `make pipeline` to close these gaps.</em>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2 CONTENT: KNOWLEDGE BASE */}
            {dashboardTab === 'files' && pipelineData && (
              <div className="dashboard-card">
                <h3 className="card-title">📁 Ingested Knowledge Base Files</h3>
                <div className="files-grid">
                  {pipelineData.files?.map((file, idx) => (
                    <div key={idx} className="file-card">
                      <div className="file-card-header">
                        <span className="file-icon">📄</span>
                        <span className="file-size-badge">
                          {(file.size / 1024).toFixed(1)} KB
                        </span>
                      </div>
                      <strong className="file-name">{file.name}</strong>
                      <span className="file-location">Target: {file.location}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 3 CONTENT: CONFIG & ARCHITECTURE VISUALIZER */}
            {dashboardTab === 'config' && pipelineData && pipelineData.config && (
              <div className="dashboard-grid">
                
                {/* Left side: Framework Components */}
                <div className="dashboard-col">
                  
                  {/* Component Diagram */}
                  <div className="dashboard-card">
                    <h3 className="card-title">🏗️ RAG Pipeline Architecture & Framework Choices</h3>
                    
                    <div className="architecture-list">
                      <div className="architecture-item blue">
                        <strong className="architecture-title">
                          1. Ingestion & Preprocessing (LangChain)
                        </strong>
                        <p className="architecture-desc">
                          Uses LangChain splitters (`MarkdownHeaderTextSplitter` + `RecursiveCharacterTextSplitter`) to index by header sections. 
                          This preserves location tags (e.g. Austin, Aubrey) in every chunk context to prevent model hallucination.
                        </p>
                      </div>

                      <div className="architecture-item amber">
                        <strong className="architecture-title">
                          2. Hybrid Vector & Keyword Retrieval (Chroma + BM25)
                        </strong>
                        <p className="architecture-desc">
                          Fuses **dense semantic search** (Chroma DB embeddings) with **sparse keyword matching** (Rank-BM25) using reciprocal score rank blending. 
                          Location metadata filters are strictly applied to vector stores to prevent geographic bleeding.
                        </p>
                      </div>

                      <div className="architecture-item green">
                        <strong className="architecture-title">
                          3. Agentic Graph State Orchestration (LangGraph)
                        </strong>
                        <p className="architecture-desc">
                          Uses a LangGraph state machine. It analyzes the user query, routes retrieval, performs validation audits (checking local sufficiency), 
                          flags warnings when falling back to general State law, and routes litigation-heavy issues to the legal aid panel.
                        </p>
                      </div>

                      <div className="architecture-item default">
                        <strong className="architecture-title">
                          4. API Server Interface (FastAPI)
                        </strong>
                        <p className="architecture-desc">
                          Exposes async endpoints for Chat routing, Resources listings, and Dashboard logs telemetry, logging searches to JSONL.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Prompt Sandbox preview */}
                  <div className="dashboard-card">
                    <h3 className="card-title">💬 RAG System Instructions Sandbox</h3>
                    <div className="sandbox-codebox">
                      {`You are a helpful Texas Renter Assistant. You answer questions about renter rights, housing codes, and landlord duties based ONLY on the provided context.\n\n` +
                       `Guidelines:\n` +
                       `1. Ground your answer strictly in the provided documents.\n` +
                       `2. Cite documents by number (e.g. [1], [2]) when referencing facts.\n` +
                       `3. Be professional, clear, and reassuring, but add a standard legal disclaimer.\n\n` +
                       `[Conditional Ingestion Trigger]\n` +
                       `If city-specific rules are not found for the requested location: You MUST prepend a warning notice: "Note: I could not find specific city-level codes for <City> regarding this issue. Here are the general Texas State laws that apply:"`}
                    </div>
                  </div>

                </div>

                {/* Right side: Parameters Gauges */}
                <div className="dashboard-col">
                  
                  {/* Parameters list */}
                  <div className="dashboard-card">
                    <h3 className="card-title">⚙️ Current Pipeline Configurations</h3>
                    
                    <div className="config-params-list">
                      <div className="config-param-item">
                        <div className="param-header">
                          <span>Ingestion Chunk Size</span>
                          <span className="param-value">{pipelineData.config.chunk_size} chars</span>
                        </div>
                        <div className="param-track">
                          <div className="param-fill blue" style={{ width: '50%' }} />
                        </div>
                      </div>

                      <div className="config-param-item">
                        <div className="param-header">
                          <span>Ingestion Chunk Overlap</span>
                          <span className="param-value">{pipelineData.config.chunk_overlap} chars</span>
                        </div>
                        <div className="param-track">
                          <div className="param-fill blue" style={{ width: '15%' }} />
                        </div>
                      </div>

                      <div className="config-param-item">
                        <div className="param-header">
                          <span>Hybrid Blending (Dense vs Sparse)</span>
                          <span className="param-value">60% Vector / 40% BM25</span>
                        </div>
                        <div className="param-track-blending">
                          <div className="blending-vector-fill" style={{ width: '60%' }} />
                        </div>
                      </div>

                      <div className="param-meta-section">
                        <div className="meta-row">
                          <span className="meta-label">Active Embedding Model</span>
                          <div className="meta-value-code">
                            {pipelineData.config.embeddings_model}
                          </div>
                        </div>

                        <div className="meta-row">
                          <span className="meta-label">Active Inference LLM Model</span>
                          <div className="meta-value-code">
                            {pipelineData.config.llm_model}
                          </div>
                        </div>

                        <div className="meta-row">
                          <span className="meta-label">Escalation Routing Rule</span>
                          <div className="meta-value">
                            Triggers on <strong>{pipelineData.config.routing_threshold}</strong>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                </div>

              </div>
            )}

            {/* TAB 4 CONTENT: MODEL PROVIDER CONNECTIONS */}
            {dashboardTab === 'connections' && (
              <div className="dashboard-grid">
                
                {/* Connection setup panels */}
                <div className="dashboard-col" style={{ gridColumn: 'span 2' }}>
                  <div className="dashboard-card">
                    <h3 className="card-title">🔑 Configure API Connections</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '13.5px', marginBottom: '24px' }}>
                      Setup and validate your API credentials for different model providers. Configured keys are saved securely to your local `.env` configuration file and loaded dynamically.
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                      
                      {/* Provider 1: Nebius Token Factory */}
                      <div className="connection-provider-item" style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '20px', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontSize: '24px' }}>🌌</span>
                            <div>
                              <strong style={{ fontSize: '16px', color: 'var(--text-primary)' }}>Nebius Token Factory API</strong>
                              <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Required for bootcamp submission. Model: meta-llama/Llama-3.3-70B-Instruct</div>
                            </div>
                          </div>
                          
                          <div>
                            {connectionStatuses.nebius === 'configured' ? (
                              <span style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}>✓ Configured</span>
                            ) : (
                              <span style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}>Not Configured</span>
                            )}
                          </div>
                        </div>

                        <div className="form-group" style={{ display: 'flex', flexDirection: 'row', gap: '12px', alignItems: 'end' }}>
                          <div style={{ flex: 1 }}>
                            <label className="form-label" style={{ marginBottom: '6px' }}>Nebius API Key</label>
                            <input 
                              type="password"
                              className="form-input"
                              value={connectionKeys.nebius}
                              onChange={(e) => setConnectionKeys({...connectionKeys, nebius: e.target.value})}
                              placeholder="Enter your Nebius API key (NEBIUS_API_KEY)"
                            />
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button 
                              className="execute-run-btn"
                              style={{ padding: '10px 18px', fontSize: '13px', margin: 0, background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)', border: '1px solid var(--border-glass)' }}
                              onClick={() => handleTestConnection('nebius')}
                              disabled={connectionTesting.nebius}
                            >
                              {connectionTesting.nebius ? 'Testing...' : '🧪 Test'}
                            </button>
                            <button 
                              className="execute-run-btn"
                              style={{ padding: '10px 18px', fontSize: '13px', margin: 0 }}
                              onClick={() => handleSaveConnection('nebius')}
                            >
                              💾 Save Connection
                            </button>
                          </div>
                        </div>

                        {connectionResults.nebius && (
                          <div style={{ 
                            marginTop: '12px', 
                            padding: '10px 14px', 
                            borderRadius: '6px', 
                            fontSize: '13px',
                            background: connectionResults.nebius.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                            color: connectionResults.nebius.success ? '#10b981' : '#ef4444',
                            border: `1px solid ${connectionResults.nebius.success ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`
                          }}>
                            {connectionResults.nebius.message}
                          </div>
                        )}
                      </div>

                      {/* Provider 2: OpenAI API */}
                      <div className="connection-provider-item" style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '20px', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontSize: '24px' }}>🤖</span>
                            <div>
                              <strong style={{ fontSize: '16px', color: 'var(--text-primary)' }}>OpenAI API</strong>
                              <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Alternative or evaluations. Model: gpt-4o-mini / text-embedding-3-small</div>
                            </div>
                          </div>
                          
                          <div>
                            {connectionStatuses.openai === 'configured' ? (
                              <span style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}>✓ Configured</span>
                            ) : (
                              <span style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}>Not Configured</span>
                            )}
                          </div>
                        </div>

                        <div className="form-group" style={{ display: 'flex', flexDirection: 'row', gap: '12px', alignItems: 'end' }}>
                          <div style={{ flex: 1 }}>
                            <label className="form-label" style={{ marginBottom: '6px' }}>OpenAI API Key</label>
                            <input 
                              type="password"
                              className="form-input"
                              value={connectionKeys.openai}
                              onChange={(e) => setConnectionKeys({...connectionKeys, openai: e.target.value})}
                              placeholder="sk-..."
                            />
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button 
                              className="execute-run-btn"
                              style={{ padding: '10px 18px', fontSize: '13px', margin: 0, background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)', border: '1px solid var(--border-glass)' }}
                              onClick={() => handleTestConnection('openai')}
                              disabled={connectionTesting.openai}
                            >
                              {connectionTesting.openai ? 'Testing...' : '🧪 Test'}
                            </button>
                            <button 
                              className="execute-run-btn"
                              style={{ padding: '10px 18px', fontSize: '13px', margin: 0 }}
                              onClick={() => handleSaveConnection('openai')}
                            >
                              💾 Save Connection
                            </button>
                          </div>
                        </div>

                        {connectionResults.openai && (
                          <div style={{ 
                            marginTop: '12px', 
                            padding: '10px 14px', 
                            borderRadius: '6px', 
                            fontSize: '13px',
                            background: connectionResults.openai.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                            color: connectionResults.openai.success ? '#10b981' : '#ef4444',
                            border: `1px solid ${connectionResults.openai.success ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`
                          }}>
                            {connectionResults.openai.message}
                          </div>
                        )}
                      </div>

                      {/* Provider 3: Google Gemini API */}
                      <div className="connection-provider-item" style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '20px', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontSize: '24px' }}>✨</span>
                            <div>
                              <strong style={{ fontSize: '16px', color: 'var(--text-primary)' }}>Google Gemini API</strong>
                              <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Alternative API calls. Model: gemini-1.5-flash</div>
                            </div>
                          </div>
                          
                          <div>
                            {connectionStatuses.gemini === 'configured' ? (
                              <span style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}>✓ Configured</span>
                            ) : (
                              <span style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}>Not Configured</span>
                            )}
                          </div>
                        </div>

                        <div className="form-group" style={{ display: 'flex', flexDirection: 'row', gap: '12px', alignItems: 'end' }}>
                          <div style={{ flex: 1 }}>
                            <label className="form-label" style={{ marginBottom: '6px' }}>Gemini API Key</label>
                            <input 
                              type="password"
                              className="form-input"
                              value={connectionKeys.gemini}
                              onChange={(e) => setConnectionKeys({...connectionKeys, gemini: e.target.value})}
                              placeholder="AIzaSy..."
                            />
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button 
                              className="execute-run-btn"
                              style={{ padding: '10px 18px', fontSize: '13px', margin: 0, background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)', border: '1px solid var(--border-glass)' }}
                              onClick={() => handleTestConnection('gemini')}
                              disabled={connectionTesting.gemini}
                            >
                              {connectionTesting.gemini ? 'Testing...' : '🧪 Test'}
                            </button>
                            <button 
                              className="execute-run-btn"
                              style={{ padding: '10px 18px', fontSize: '13px', margin: 0 }}
                              onClick={() => handleSaveConnection('gemini')}
                            >
                              💾 Save Connection
                            </button>
                          </div>
                        </div>

                        {connectionResults.gemini && (
                          <div style={{ 
                            marginTop: '12px', 
                            padding: '10px 14px', 
                            borderRadius: '6px', 
                            fontSize: '13px',
                            background: connectionResults.gemini.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                            color: connectionResults.gemini.success ? '#10b981' : '#ef4444',
                            border: `1px solid ${connectionResults.gemini.success ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`
                          }}>
                            {connectionResults.gemini.message}
                          </div>
                        )}
                      </div>

                    </div>
                  </div>
                </div>

              </div>
            )}
          </div>
        )}
      </div>

      {/* Main UI Sidebar (Citations & Resources) - Only render on chat view */}
      {view === 'chat' && (
        <div className="sidebar">
          <h2>ℹ️ Reference Panel</h2>
          
          <div>
            <h3 style={{ fontSize: '13px', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '1px', marginBottom: '14px' }}>
              📞 {selectedCity ? `${selectedCity} & Texas Support` : "Statewide Help"}
            </h3>
            <div className="resource-list">
              {getDisplayResources().map((res, idx) => (
                <div key={idx} className="resource-card">
                  <div className="resource-name">{res.name}</div>
                  <div className="resource-desc">{res.description}</div>
                  <div className="resource-contact">
                    {res.phone && <span>📞 {res.phone}</span>}
                    {res.website && (
                      <a href={res.website} target="_blank" rel="noopener noreferrer">
                        🌐 Website
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

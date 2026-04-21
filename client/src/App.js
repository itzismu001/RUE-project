import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'framer-motion';
import { Group, Panel, Separator } from 'react-resizable-panels';
import ConceptGraph from './components/ConceptGraph';

let nextId = 0;
const getNextId = () => `node-${nextId++}`;

const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } }
};

const itemVariants = {
  hidden: { opacity: 0, y: 10, scale: 0.95 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 300, damping: 24 } }
};

const renderAnswerWithClickableTerms = (text, concepts, onTermClick, darkMode) => {
  if (!concepts || concepts.length === 0) return <ReactMarkdown>{text}</ReactMarkdown>;

  const conceptTerms = concepts.map(c => typeof c === 'string' ? c : c.term);
  const sorted = [...conceptTerms].sort((a, b) => b.length - a.length);
  const regex = new RegExp(`\\b(${sorted.map(escapeRegExp).join('|')})\\b`, 'gi');
  const parts = text.split(regex);

  const diffColor = {
    beginner: darkMode ? '#60a5fa' : '#2563eb',
    intermediate: darkMode ? '#fbbf24' : '#d97706',
    advanced: darkMode ? '#a78bfa' : '#7c3aed'
  };

  return (
    <div style={{ lineHeight: '1.8', fontSize: '15px', color: darkMode ? '#f1f5f9' : '#0f172a' }}>
      {parts.map((part, idx) => {
        const conceptObj = concepts.find(c => 
          (typeof c === 'string' ? c.toLowerCase() : c.term.toLowerCase()) === part.toLowerCase()
        );

        if (conceptObj && part.trim()) {
          const term = typeof conceptObj === 'string' ? conceptObj : conceptObj.term;
          const difficulty = conceptObj.difficulty || 'beginner';

          return (
            <motion.button
              key={idx}
              whileHover={{ scale: 1.05, filter: 'brightness(1.2)' }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onTermClick(term)}
              style={{
                display: 'inline-block',
                background: `${diffColor[difficulty]}20`,
                border: `1px solid ${diffColor[difficulty]}80`,
                borderRadius: '6px',
                padding: '2px 6px',
                margin: '0 2px',
                cursor: 'pointer',
                fontSize: '0.95em',
                fontWeight: '600',
                color: diffColor[difficulty],
                transition: 'all 0.2s ease',
              }}
            >
              {part}
            </motion.button>
          );
        }
        return <span key={idx}>{part}</span>;
      })}
    </div>
  );
};

const LoadingAnimation = () => {
  const [msgIndex, setMsgIndex] = useState(0);
  const messages = ['🧠 Synthesizing knowledge...', '🔍 Mapping concepts...', '📚 Structuring data...', '✨ Illuminating insights...'];
  useEffect(() => {
    const interval = setInterval(() => setMsgIndex(i => (i + 1) % messages.length), 2000);
    return () => clearInterval(interval);
  }, [messages.length]);
  
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: '10px' }}>
      <motion.div animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1.5 }} style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#3b82f6', boxShadow: '0 0 10px #3b82f6' }} />
      <motion.span key={msgIndex} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} style={{ color: 'var(--text-muted, #64748b)', fontStyle: 'italic', fontSize: '14px', fontWeight: '500' }}>
        {messages[msgIndex]}
      </motion.span>
    </motion.div>
  );
};

function App() {
  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState([]);
  const [currentNode, setCurrentNode] = useState(null);
  const [loading, setLoading] = useState(false);
  const [graphVisible, setGraphVisible] = useState(true);
  const [graphLayout, setGraphLayout] = useState('horizontal');
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('theme') === 'dark');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [zenMode, setZenMode] = useState(false); 

  const exampleQuestions = [
    { label: "What is LIME in AI?", icon: "🤖" },
    { label: "How does Photosynthesis work?", icon: "🌱" },
    { label: "Explain Quantum Entanglement.", icon: "🌌" },
    { label: "What is the Blockchain?", icon: "⛓️" }
  ];

  useEffect(() => {
    document.body.className = darkMode ? 'dark' : 'light';
    localStorage.setItem('theme', darkMode ? 'dark' : 'light');
    document.body.style.fontFamily = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    document.body.style.background = darkMode ? '#0f172a' : '#f8fafc';
    document.body.style.color = darkMode ? '#f1f5f9' : '#0f172a';
    document.body.style.margin = '0';
    document.body.style.transition = 'background 0.3s ease, color 0.3s ease';
  }, [darkMode]);

  useEffect(() => {
    return () => window.speechSynthesis.cancel();
  }, []);

  const getBreadcrumbs = () => {
    const crumbs = [];
    let node = currentNode;
    while (node) {
      const label = node.type === 'answer' ? 'Start' : node.term;
      crumbs.unshift({ id: node.id, label, depth: node.depth });
      const parentId = node.parentId;
      node = history.find(n => n.id === parentId);
    }
    return crumbs;
  };

  const estimateTokens = (text) => Math.floor(text.length / 4);

  const askQuestion = async () => { 
    if (!question.trim()) return;
    setLoading(true);
    try {
      const res = await axios.post('https://rue-project.onrender.com/api/ask', { question });
      const { answer_text, concepts, usage } = res.data;
      
      const newNode = {
        id: getNextId(), 
        type: 'answer', 
        content: answer_text, 
        concepts: concepts || [], 
        prompt: `Initial Question: "${question}"`, 
        parentId: null, 
        depth: 0, 
        term: null,
        usage: usage,
        cache_hit: res.data.cache_hit || false // ADDED: Capture cache state
      };
      
      setHistory([newNode]); 
      setCurrentNode(newNode);
    } catch (err) { 
      alert('Error fetching answer. Check if server is running!'); 
    } finally { 
      setLoading(false); 
    }
  };

  const explainConcept = async (term) => { 
    if (!currentNode) return;
    setLoading(true);
    try {
      const res = await axios.post('https://rue-project.onrender.com/api/explain', { 
        term, 
        contextQuestion: history[0]?.content, 
        depth: currentNode.depth + 1 
      });
      
      const { answer_text, concepts, usage } = res.data;
      
      const newNode = {
        id: getNextId(), 
        type: 'explanation', 
        content: answer_text, 
        concepts: res.data.concepts || [], 
        term: term, 
        depth: currentNode.depth + 1,
        parentId: currentNode.id, 
        usage: usage,
        cache_hit: res.data.cache_hit || false // ADDED: Capture cache state
      };
      
      setHistory(prev => [...prev, newNode]); 
      setCurrentNode(newNode);
    } catch (err) { 
      alert('Error exploring concept.'); 
    } finally { 
      setLoading(false); 
    }
  };

  const goBack = () => { if (currentNode?.parentId) setCurrentNode(history.find(n => n.id === currentNode.parentId)); };
  
  const reset = () => { 
    setHistory([]); setCurrentNode(null); setQuestion(''); nextId = 0; 
    window.speechSynthesis.cancel(); setIsSpeaking(false);
  };
  
  const handleCrumbClick = (id) => { const node = history.find(n => n.id === id); if (node) setCurrentNode(node); };
  
  const breadcrumbs = getBreadcrumbs();
  const cycleLayout = () => { const layouts = ['horizontal', 'vertical', 'auto']; setGraphLayout(layouts[(layouts.indexOf(graphLayout) + 1) % layouts.length]); };

  const toggleReadAloud = (text) => {
    if (!('speechSynthesis' in window)) return alert("Sorry, your browser doesn't support Text-to-Speech!");
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    } else {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95; 
      utterance.onend = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
      setIsSpeaking(true);
    }
  };

  const exportStudyGuide = () => {
    if (history.length === 0) return alert("Nothing to export yet! Start exploring to build your guide.");
    let markdown = `# My Learning Journey\n**Initial Topic:** ${history[0].prompt.replace('Initial Question: "', '').replace('"', '')}\n\n---\n\n`;
    history.forEach((node) => {
      const heading = node.type === 'answer' ? 'Core Explanation' : `Deep Dive: ${node.term}`;
      markdown += `## ${heading} (Depth ${node.depth})\n\n${node.content}\n\n`;
      if (node.concepts.length > 0) {
        const terms = node.concepts.map(c => c.term).join(', ');
        markdown += `**Key Concepts Discovered:** ${terms}\n\n`;
      }
      markdown += `---\n\n`;
    });
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Study_Guide_${new Date().toISOString().split('T')[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const theme = {
    panelBg: darkMode ? '#1e293b' : '#ffffff',
    borderColor: darkMode ? '#334155' : '#e2e8f0',
    inputBg: darkMode ? '#0f172a' : '#f8fafc',
    cardBg: darkMode ? 'rgba(30, 41, 59, 0.7)' : '#ffffff',
    textMain: darkMode ? '#f1f5f9' : '#0f172a',
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <motion.div initial={{ y: -50 }} animate={{ y: 0 }} style={{ padding: '16px 24px', background: theme.panelBg, borderBottom: `1px solid ${theme.borderColor}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10, boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ fontSize: '24px' }}>🧠</div>
          <h1 style={{ 
  margin: 0, 
  fontSize: '20px', 
  fontWeight: '800', 
  letterSpacing: '-0.5px',
  background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent'
}}>
  DeepLearn Navigator
</h1>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <motion.button onClick={() => setZenMode(!zenMode)} whileHover={{ scale: 1.05, y: -2 }} whileTap={{ scale: 0.95 }} style={{ padding: '8px 16px', background: zenMode ? '#8b5cf6' : 'transparent', border: `1px solid ${zenMode ? '#8b5cf6' : theme.borderColor}`, borderRadius: '8px', cursor: 'pointer', color: zenMode ? 'white' : theme.textMain, fontWeight: '500', transition: 'all 0.3s ease' }}>
            {zenMode ? '🧘‍♂️ Exit Zen Mode' : '🧘‍♀️ Zen Mode'}
          </motion.button>
          {history.length > 0 && (
            <motion.button onClick={exportStudyGuide} whileHover={{ scale: 1.05, y: -2 }} whileTap={{ scale: 0.95 }} style={{ padding: '8px 16px', background: '#22c55e', border: 'none', borderRadius: '8px', cursor: 'pointer', color: 'white', fontWeight: '600' }}>
              📥 Export Guide
            </motion.button>
          )}
          {!zenMode && (
            <motion.button onClick={cycleLayout} whileHover={{ scale: 1.05, y: -2 }} whileTap={{ scale: 0.95 }} style={{ padding: '8px 16px', background: 'transparent', border: `1px solid ${theme.borderColor}`, borderRadius: '8px', cursor: 'pointer', color: theme.textMain, fontWeight: '500' }}>
              📊 {graphLayout.charAt(0).toUpperCase() + graphLayout.slice(1)}
            </motion.button>
          )}
          <motion.button onClick={() => setDarkMode(!darkMode)} whileHover={{ scale: 1.05, y: -2 }} whileTap={{ scale: 0.95 }} style={{ padding: '8px 16px', background: darkMode ? '#334155' : '#e2e8f0', border: 'none', borderRadius: '8px', cursor: 'pointer', color: theme.textMain, fontWeight: '500' }}>
            {darkMode ? '☀️ Light' : '🌙 Dark'}
          </motion.button>
        </div>
      </motion.div>

      <Group direction="horizontal" style={{ flex: 1 }}>
        {!zenMode && (
          <Panel defaultSize={25} minSize={15}>
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: darkMode ? '#0f172a' : '#f8fafc' }}>
              <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                 <h3 style={{ margin: 0, fontSize: '14px', textTransform: 'uppercase', letterSpacing: '1px', color: '#64748b' }}>Knowledge Map</h3>
              </div>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ flex: 1, overflow: 'auto' }}>
                <ConceptGraph history={history} layout={graphLayout} currentNodeId={currentNode?.id} onNodeClick={handleCrumbClick} />
              </motion.div>
            </div>
          </Panel>
        )}
        {!zenMode && <Separator style={{ width: '4px', background: theme.borderColor, cursor: 'col-resize', transition: 'background 0.2s' }} />}

        <Panel defaultSize={zenMode ? 100 : 50} minSize={30}>
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: theme.panelBg }}>
            <div style={{ boxSizing: 'border-box', padding: '24px', borderBottom: `1px solid ${theme.borderColor}`, maxWidth: zenMode ? '1000px' : '100%', margin: zenMode ? '0 auto' : '0', width: '100%' }}>
              <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', position: 'relative' }}>
                <textarea rows="2" value={question} onChange={e => setQuestion(e.target.value)} placeholder="What would you like to explore?" style={{ flex: 1, padding: '16px', fontSize: '16px', background: theme.inputBg, color: theme.textMain, border: `2px solid ${theme.borderColor}`, borderRadius: '12px', resize: 'none', outline: 'none', transition: 'border-color 0.2s', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)' }} onFocus={(e) => e.target.style.borderColor = '#3b82f6'} onBlur={(e) => e.target.style.borderColor = theme.borderColor} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); askQuestion(); } }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0, minWidth: '120px' }}>
                  <motion.button onClick={askQuestion} disabled={loading} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} style={{ flex: 1, padding: '0 24px', background: 'linear-gradient(135deg, #2563eb, #3b82f6)', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '600', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)' }}>Ask AI</motion.button>
                  <motion.button onClick={reset} disabled={loading} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} style={{ padding: '8px 24px', background: 'transparent', color: '#ef4444', border: '1px solid #ef4444', borderRadius: '10px', cursor: 'pointer', fontWeight: '500' }}>Reset</motion.button>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: '36px' }}>
                <AnimatePresence>
                  {breadcrumbs.length > 0 && (
                    <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} style={{ fontSize: '14px', padding: '8px 16px', background: theme.inputBg, borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '8px', border: `1px solid ${theme.borderColor}` }}>
                      <span style={{ color: '#64748b' }}>📍 Depth {currentNode?.depth || 0}:</span>
                      {breadcrumbs.map((c, i) => (
                        <span key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {i > 0 && <span style={{ color: '#cbd5e1' }}>/</span>}
                          <motion.span whileHover={{ color: '#3b82f6' }} style={{ cursor: 'pointer', color: theme.textMain, fontWeight: c.id === currentNode?.id ? '600' : '400' }} onClick={() => handleCrumbClick(c.id)}>{c.label}</motion.span>
                        </span>
                      ))}
                      
                      {/* UPGRADE 1: ELI5 ADAPTIVE BADGE */}
                      {currentNode?.depth > 3 && (
                        <span style={{ 
                          background: 'linear-gradient(135deg, #f59e0b, #ef4444)', 
                          color: 'white', 
                          padding: '2px 8px', 
                          borderRadius: '12px', 
                          fontSize: '10px', 
                          fontWeight: 'bold', 
                          marginLeft: '8px',
                          boxShadow: '0 2px 4px rgba(239, 68, 68, 0.2)'
                        }}>
                          🧠 ELI5 MODE ACTIVE
                        </span>
                      )}

                    </motion.div>
                  )}
                </AnimatePresence>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  {loading && <LoadingAnimation />}
                  {currentNode?.parentId && (
                    <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={goBack} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} style={{ padding: '8px 16px', background: theme.inputBg, border: `1px solid ${theme.borderColor}`, borderRadius: '20px', cursor: 'pointer', color: theme.textMain, fontWeight: '500' }}>← Go Back</motion.button>
                  )}
                </div>
              </div>
            </div>

            <div style={{ flex: 1, overflow: 'auto', padding: '32px', background: theme.inputBg }}>
              {currentNode ? (
                <motion.div key={currentNode.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: "easeOut" }} style={{ maxWidth: '800px', margin: '0 auto' }}>
                  <div style={{ border: `1px solid ${theme.borderColor}`, borderRadius: '16px', padding: '32px', background: theme.cardBg, boxShadow: '0 10px 30px -10px rgba(0,0,0,0.05)', backdropFilter: 'blur(10px)', marginBottom: '32px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                      <h2 style={{ marginTop: 0, fontSize: '22px', color: theme.textMain }}>{currentNode.type === 'answer' ? 'Initial Response' : `Exploring: ${currentNode.term}`}</h2>
                      <motion.button onClick={() => toggleReadAloud(currentNode.content)} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} style={{ background: isSpeaking ? '#ef4444' : 'transparent', color: isSpeaking ? 'white' : theme.textMain, border: `1px solid ${theme.borderColor}`, borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }} title={isSpeaking ? "Stop Reading" : "Read Aloud"}>
                        {isSpeaking ? '⏹️' : '🔊'}
                      </motion.button>
                    </div>
                    {renderAnswerWithClickableTerms(currentNode.content, currentNode.concepts, explainConcept, darkMode)}
                  </div>

                  {currentNode.concepts?.length > 0 && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
                      <h3 style={{ margin: '0 0 16px 4px', fontSize: '15px', textTransform: 'uppercase', letterSpacing: '1px', color: '#64748b' }}>🧬 Dive Deeper</h3>
                      <motion.div variants={containerVariants} initial="hidden" animate="show" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                        {currentNode.concepts.map((conceptObj, idx) => {
                          const isRecommended = conceptObj.relevance_score > 8;
                          const diffColor = {
                            beginner: '#22c55e',
                            intermediate: '#3b82f6',
                            advanced: '#8b5cf6'
                          };

                          return (
                            <motion.button
                              key={idx}
                              variants={itemVariants}
                              whileHover={{ scale: 1.05, y: -2, boxShadow: isRecommended ? '0 8px 16px rgba(34,197,94,0.25)' : '0 6px 12px rgba(37,99,235,0.15)' }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => explainConcept(conceptObj.term)}
                              style={{
                                background: isRecommended ? (darkMode ? 'rgba(34, 197, 94, 0.1)' : '#f0fdf4') : theme.panelBg,
                                border: `2px solid ${isRecommended ? '#22c55e' : theme.borderColor}`,
                                borderRadius: '24px',
                                padding: isRecommended ? '10px 24px' : '10px 20px',
                                cursor: 'pointer',
                                fontSize: '14px',
                                fontWeight: isRecommended ? '700' : '500',
                                color: isRecommended ? (darkMode ? '#4ade80' : '#166534') : (diffColor[conceptObj.difficulty] || theme.textMain),
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                boxShadow: isRecommended ? '0 4px 12px rgba(34,197,94,0.1)' : '0 2px 4px rgba(0,0,0,0.02)',
                                position: 'relative',
                                overflow: 'hidden'
                              }}
                            >
                              {isRecommended && (
  <span style={{ 
    position: 'absolute', 
    top: '4px',           
    right: '-24px',       
    background: '#22c55e', 
    color: 'white', 
    fontSize: '9px', 
    padding: '2px 25px',  
    transform: 'rotate(45deg)', 
    textTransform: 'uppercase', 
    letterSpacing: '1px',
    fontWeight: '800',    
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    zIndex: 1
  }}>
    CORE
  </span>
)}
                              <span>{isRecommended ? '⭐' : <span style={{ color: diffColor[conceptObj.difficulty] }}>❖</span>}</span> 
                              {conceptObj.term}
                            </motion.button>
                          );
                        })}
                      </motion.div>
                    </motion.div>
                  )}
                </motion.div>
              ) : (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }} 
                  animate={{ opacity: 1, scale: 1 }} 
                  style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', padding: '40px' }}
                >
                  <motion.div 
                    animate={{ y: [0, -10, 0] }} 
                    transition={{ repeat: Infinity, duration: 3 }} 
                    style={{ fontSize: '64px', marginBottom: '24px' }}
                  >
                    ✨
                  </motion.div>
                  <h3 style={{ margin: 0, fontSize: '24px', color: theme.textMain, fontWeight: '800', letterSpacing: '-0.5px' }}>
                    Start Your Journey
                  </h3>
                  <p style={{ marginTop: '8px', marginBottom: '40px', textAlign: 'center', maxWidth: '400px', lineHeight: '1.5' }}>
                    Achieve deep clarity through recursive exploration. Type a question or try an example:
                  </p>
                  
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', 
                    gap: '20px', 
                    maxWidth: '700px', 
                    width: '100%' 
                  }}>
                    {exampleQuestions.map((ex, i) => (
                      <motion.button
                        key={i}
                        whileHover={{ scale: 1.03, y: -5, boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => setQuestion(ex.label)}
                        style={{
                          padding: '24px',
                          background: theme.cardBg,
                          border: `1px solid ${theme.borderColor}`,
                          borderRadius: '20px',
                          cursor: 'pointer',
                          textAlign: 'left',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '16px',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <span style={{ fontSize: '32px' }}>{ex.icon}</span>
                        <span style={{ color: theme.textMain, fontWeight: '700', fontSize: '15px', lineHeight: '1.3' }}>
                          {ex.label}
                        </span>
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        </Panel>

        {!zenMode && <Separator style={{ width: '4px', background: theme.borderColor, cursor: 'col-resize' }} />}
        {!zenMode && (
          <Panel defaultSize={25} minSize={20}>
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: theme.panelBg }}>
              <div style={{ padding: '16px', borderBottom: `1px solid ${theme.borderColor}` }}>
                <h3 style={{ margin: 0, fontSize: '14px', textTransform: 'uppercase', letterSpacing: '1px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e' }}></span>
                  Mastery Progress
                </h3>
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
                
                {/* Mastery Checklist & Progress Bar */}
                <div style={{ padding: '20px', background: theme.cardBg, borderRadius: '16px', border: `2px solid ${theme.borderColor}`, boxShadow: '0 4px 12px rgba(0,0,0,0.05)', marginBottom: '24px' }}>
                  
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                      <span style={{ color: '#94a3b8', fontWeight: '600' }}>Layer Completion</span>
                      <span style={{ color: '#22c55e', fontWeight: 'bold' }}>
                        {currentNode?.concepts?.length > 0 
                          ? Math.round((history.filter(h => currentNode.concepts.some(c => (typeof c === 'string' ? c : c.term) === h.term)).length / currentNode.concepts.length) * 100) 
                          : 0}%
                      </span>
                    </div>
                    <div style={{ height: '6px', width: '100%', background: darkMode ? 'rgba(255,255,255,0.1)' : '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${currentNode?.concepts?.length > 0 ? (history.filter(h => currentNode.concepts.some(c => (typeof c === 'string' ? c : c.term) === h.term)).length / currentNode.concepts.length) * 100 : 0}%` }}
                        style={{ height: '100%', background: '#22c55e', borderRadius: '3px' }} 
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                    <span style={{ fontSize: '18px' }}>🎯</span>
                    <h4 style={{ margin: 0, fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.5px' }}>
                      Prerequisites
                    </h4>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {currentNode?.concepts.length > 0 ? (
                      currentNode.concepts.map((c, i) => {
                        const termStr = typeof c === 'string' ? c : c.term;
                        const isMastered = history.some(node => node.term === termStr);
                        
                        return (
                          <motion.div 
                            key={i} 
                            initial={{ opacity: 0, x: 10 }} 
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.1 }}
                            style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '12px', 
                              padding: '10px', 
                              background: isMastered ? (darkMode ? 'rgba(34, 197, 94, 0.15)' : '#f0fdf4') : 'transparent',
                              borderRadius: '8px',
                              border: `1px solid ${isMastered ? '#22c55e' : 'transparent'}`,
                              transition: 'all 0.3s ease'
                            }}
                          >
                            <div style={{ 
                              width: '18px', height: '18px', borderRadius: '50%', 
                              border: `2px solid ${isMastered ? '#22c55e' : '#cbd5e1'}`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              background: isMastered ? '#22c55e' : 'transparent',
                              fontSize: '10px', color: 'white'
                            }}>
                              {isMastered ? '✓' : ''}
                            </div>
                            <span style={{ 
                              fontSize: '13px', 
                              fontWeight: '600', 
                              color: isMastered ? (darkMode ? '#4ade80' : '#166534') : theme.textMain,
                              opacity: isMastered ? 1 : 0.8 
                            }}>
                              {termStr}
                            </span>
                          </motion.div>
                        );
                      })
                    ) : (
                      <div style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic', textAlign: 'center' }}>
                        No prerequisites identified for this layer.
                      </div>
                    )}
                  </div>
                </div>

                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} style={{ background: theme.inputBg, padding: '20px', borderRadius: '12px', border: `1px solid ${theme.borderColor}` }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                    <div>
                      <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Depth Level</div>
                      <div style={{ fontSize: '24px', fontWeight: 'bold', color: theme.textMain }}>{currentNode?.depth || 0}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Model Core</div>
                      <div style={{ 
                        fontSize: '13px', 
                        fontWeight: '800', 
                        color: '#38bdf8', 
                        marginTop: '4px',
                        textShadow: '0 0 8px rgba(56, 189, 248, 0.4)' 
                      }}>
                        Gemini 2.5 Flash Lite
                      </div>
                    </div>
                  </div>

                  <div style={{ borderTop: `1px solid ${theme.borderColor}`, paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                      <span style={{ color: '#64748b' }}>Prompt Tokens</span>
                      <span style={{ color: theme.textMain, fontFamily: 'monospace' }}>
                        {currentNode?.usage?.prompt_tokens ?? '—'} 
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                      <span style={{ color: '#64748b' }}>Completion Tokens</span>
                      <span style={{ color: theme.textMain, fontFamily: 'monospace' }}>
                        {currentNode?.usage?.completion_tokens ?? '—'}
                      </span>
                    </div>
                    
                    {/* UPGRADE 2: CACHE HIT TELEMETRY UI */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                      <span style={{ color: '#64748b' }}>Network Source</span>
                      <span style={{ 
                        color: currentNode?.cache_hit ? '#22c55e' : '#f59e0b', 
                        fontWeight: 'bold', 
                        fontFamily: 'monospace' 
                      }}>
                        {currentNode?.cache_hit ? '⚡ CACHE HIT (0ms)' : '🌐 API REQUEST'}
                      </span>
                    </div>

                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      fontSize: '14px', 
                      fontWeight: 'bold', 
                      marginTop: '4px', 
                      paddingTop: '8px', 
                      borderTop: `1px dashed ${theme.borderColor}` 
                    }}>
                      <span style={{ color: theme.textMain }}>Total Compute</span>
                      <span style={{ color: '#3b82f6', fontFamily: 'monospace' }}>
                        {currentNode?.usage?.total_tokens || '928'}
                      </span>
                    </div>
                  </div>
                </motion.div>

                {/* AI Usage Transparency: Prompts */}
                <div style={{ marginTop: '24px', background: theme.cardBg, borderRadius: '16px', border: `1px solid ${theme.borderColor}`, padding: '16px' }}>
                  <details style={{ cursor: 'pointer' }}>
                    <summary style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', outline: 'none', display: 'flex', alignItems: 'center', gap: '8px', letterSpacing: '0.5px' }}>
                      <span>👁️ View System Prompts</span>
                    </summary>
                    <div style={{ 
                      marginTop: '12px', 
                      fontSize: '11px', 
                      color: theme.textMain, 
                      background: theme.inputBg, 
                      padding: '12px', 
                      borderRadius: '8px', 
                      border: `1px solid ${theme.borderColor}`, 
                      fontFamily: 'monospace', 
                      whiteSpace: 'pre-wrap', 
                      maxHeight: '200px', 
                      overflowY: 'auto',
                      lineHeight: '1.6'
                    }}>
                      <strong style={{color: '#3b82f6'}}>// Root Topic Prompt (Depth 0)</strong><br/>
                      "You are an expert teacher. Provide a clear, jargon-free answer. Break it into short paragraphs. Identify 8-12 'Load-bearing' concepts. Criteria: Essential for true understanding, not common words, assign difficulty based on prior knowledge needed."
                      <br/><br/>
                      <strong style={{color: '#22c55e'}}>// Recursive Exploration (Depth 1-3)</strong><br/>
                      "Explain the concept in the context of the original query. Define simply and provide a concrete example. Extract 5-8 NEW sub-concepts found within THIS explanation to continue the recursion."
                      <br/><br/>
                      <strong style={{color: '#ef4444'}}>// ELI5 Adaptive Logic (Depth &gt; 3)</strong><br/>
                      "Instruction: Explain like I'm 5. Avoid all technical jargon. Use simple metaphors."
                    </div>
                  </details>
                </div>

              </div>
            </div>
          </Panel>
        )}
      </Group>
    </div>
  );
}

export default App;
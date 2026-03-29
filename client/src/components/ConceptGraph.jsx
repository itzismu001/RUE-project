import React, { useMemo, useEffect } from 'react';
import ReactFlow, { 
  Background, 
  Controls, 
  MiniMap, 
  MarkerType, 
  Handle, 
  Position,
  useNodesState,
  useEdgesState,
  Panel
} from 'reactflow';
import dagre from 'dagre';
import { motion } from 'framer-motion';
import 'reactflow/dist/style.css';

// --- 1. Custom Animated Node (Enhanced with Difficulty Metadata) ---
const CustomNode = ({ data, isConnectable }) => {
  const isQuestion = data.type === 'answer';
  const isActive = data.isActive;
  
  // Color mapping based on pedagogical difficulty
  const diffColor = {
    beginner: '#22c55e',   // Green
    intermediate: '#3b82f6', // Blue
    advanced: '#8b5cf6'    // Purple
  };

  const borderColor = isActive ? '#22c55e' : (isQuestion ? '#8b5cf6' : (diffColor[data.difficulty] || '#3b82f6'));
  const glowEffect = isActive 
    ? (data.darkMode ? "0 0 20px rgba(34, 197, 94, 0.4)" : "0 0 20px rgba(34, 197, 94, 0.6)")
    : (data.darkMode ? "0 4px 6px rgba(0,0,0,0.3)" : "0 4px 6px rgba(0,0,0,0.05)");

  // Logic: Dynamic Icon based on Depth and Complexity
  const getIcon = () => {
    if (isActive) return '📍';
    if (isQuestion) return '🧠';
    if (data.difficulty === 'advanced') return '🔬';
    if (data.difficulty === 'intermediate') return '📖';
    return '✨';
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      whileHover={{ scale: 1.05, boxShadow: data.darkMode ? `0 0 15px ${borderColor}88` : `0 10px 25px ${borderColor}44` }}
      style={{
        background: isActive ? (data.darkMode ? '#064e3b' : '#f0fdf4') : (data.darkMode ? '#1e293b' : '#ffffff'),
        border: `2px solid ${borderColor}`,
        borderRadius: '12px',
        padding: '12px 20px',
        minWidth: '180px',
        textAlign: 'center',
        color: data.darkMode ? '#f1f5f9' : '#0f172a',
        boxShadow: glowEffect,
        position: 'relative',
        cursor: 'pointer',
      }}
    >
      {isActive && (
        <motion.div 
          animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ repeat: Infinity, duration: 2 }}
          style={{ position: 'absolute', top: '-6px', right: '-6px', width: '12px', height: '12px', background: '#22c55e', borderRadius: '50%', border: '2px solid white' }}
        />
      )}

      <Handle 
        type="target" 
        position={data.layout === 'horizontal' ? Position.Left : Position.Top} 
        isConnectable={isConnectable} 
        style={{ background: borderColor, width: '8px', height: '8px', border: 'none' }}
      />
      
      <div style={{ fontSize: '20px', marginBottom: '4px' }}>
        {getIcon()}
      </div>
      <div style={{ fontSize: '14px', fontWeight: isActive ? '700' : '600', letterSpacing: '-0.3px', lineHeight: '1.2' }}>
        {data.label}
      </div>
      
      {/* Enhanced Metadata Badges */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '4px', marginTop: '6px' }}>
        <div style={{ fontSize: '9px', color: '#fff', background: borderColor, padding: '1px 6px', borderRadius: '4px', textTransform: 'uppercase', fontWeight: 'bold' }}>
          {data.difficulty || 'Core'}
        </div>
        <div style={{ fontSize: '9px', color: data.darkMode ? '#94a3b8' : '#64748b', border: `1px solid ${data.darkMode ? '#334155' : '#e2e8f0'}`, padding: '1px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
          D:{data.depth}
        </div>
      </div>

      <Handle 
        type="source" 
        position={data.layout === 'horizontal' ? Position.Right : Position.Bottom} 
        isConnectable={isConnectable}
        style={{ background: borderColor, width: '8px', height: '8px', border: 'none' }} 
      />
    </motion.div>
  );
};

const nodeTypes = { custom: CustomNode };

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const getLayoutedElements = (nodes, edges, direction = 'TB') => {
  const isHorizontal = direction === 'LR';
  dagreGraph.setGraph({ rankdir: direction, nodesep: 80, ranksep: 120 });

  nodes.forEach((node) => { dagreGraph.setNode(node.id, { width: 200, height: 100 }); });
  edges.forEach((edge) => { dagreGraph.setEdge(edge.source, edge.target); });

  dagre.layout(dagreGraph);

  return {
    nodes: nodes.map((node) => {
      const nodeWithPosition = dagreGraph.node(node.id);
      return {
        ...node,
        targetPosition: isHorizontal ? 'left' : 'top',
        sourcePosition: isHorizontal ? 'right' : 'bottom',
        position: { x: nodeWithPosition.x - 200 / 2, y: nodeWithPosition.y - 100 / 2 },
      };
    }),
    edges
  };
};

const ConceptGraph = ({ history, layout = 'vertical', currentNodeId, onNodeClick }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const isDarkMode = document.body.classList.contains('dark');

  useEffect(() => {
    if (!history.length) {
      setNodes([]); setEdges([]); return;
    }

    const rawNodes = history.map((node) => {
      // Find the specific concept metadata in the parent's concepts array
      const parentNode = history.find(n => n.id === node.parentId);
      const conceptData = parentNode?.concepts?.find(c => c.term === node.term);

      return {
        id: node.id,
        type: 'custom',
        data: { 
          label: node.type === 'answer' ? 'Root Topic' : node.term,
          type: node.type,
          depth: node.depth,
          difficulty: conceptData?.difficulty || 'beginner',
          relevance: conceptData?.relevance_score || 10,
          layout: layout === 'horizontal' ? 'horizontal' : 'vertical',
          darkMode: isDarkMode,
          isActive: node.id === currentNodeId 
        },
        position: { x: 0, y: 0 }, 
      };
    });

    const rawEdges = history
      .filter((node) => node.parentId)
      .map((node) => {
        const isTargetActive = node.id === currentNodeId;
        return {
          id: `edge-${node.parentId}-${node.id}`,
          source: node.parentId,
          target: node.id,
          type: 'smoothstep', 
          animated: true,
          style: { 
            stroke: isTargetActive ? '#22c55e' : (isDarkMode ? '#38bdf8' : '#3b82f6'), 
            strokeWidth: isTargetActive ? 4 : 2 
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 20, height: 20,
            color: isTargetActive ? '#22c55e' : (isDarkMode ? '#38bdf8' : '#3b82f6'),
          },
        };
      });

    const direction = layout === 'horizontal' ? 'LR' : 'TB';
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(rawNodes, rawEdges, direction);

    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [history, layout, isDarkMode, currentNodeId, setNodes, setEdges]);

  return (
    <div style={{ height: '100%', width: '100%', background: isDarkMode ? '#0f172a' : '#f8fafc' }}>
      <ReactFlow 
        nodes={nodes} 
        edges={edges} 
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_, node) => {
          if (onNodeClick) onNodeClick(node.id);
        }}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.2}
        maxZoom={1.5}
      >
        <Background color={isDarkMode ? '#334155' : '#cbd5e1'} gap={20} size={2} />
        <Controls />
        <MiniMap 
          nodeColor={n => n.data.isActive ? '#22c55e' : (isDarkMode ? '#3b82f6' : '#60a5fa')} 
        />
      </ReactFlow>
    </div>
  );
};

export default ConceptGraph;
import { useCallback, useMemo } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  MiniMap,
  ConnectionMode,
  Panel,
  useNodesState,
  useEdgesState,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Building2, Home, Package, Radio } from 'lucide-react';
import type { IFCModel, IFCNode as IFCNodeType, DeviceMapping } from '../types/ifc';

interface DigitalTwinFlowGraphProps {
  model: IFCModel | null;
  deviceMappings: Map<string, string>;
  onNodeClick: (node: IFCNodeType) => void;
}

// Neo4j-style color scheme
const getNodeColor = (type: string): { main: string; border: string; glow: string } => {
  if (type.includes('BUILDING') || type.includes('PROJECT') || type.includes('SITE')) {
    return { main: '#4C8EDA', border: '#6BA3E8', glow: 'rgba(76, 142, 218, 0.5)' }; // Blue
  }
  if (type.includes('SPACE') || type.includes('BUILDINGSTOREY')) {
    return { main: '#DA7194', border: '#E88AAC', glow: 'rgba(218, 113, 148, 0.5)' }; // Pink
  }
  if (type.includes('DISTRIBUTIONCONTROLELEMENT')) {
    return { main: '#F79767', border: '#FFA980', glow: 'rgba(247, 151, 103, 0.5)' }; // Orange
  }
  if (type.includes('SENSOR')) {
    return { main: '#57C7E3', border: '#70D4ED', glow: 'rgba(87, 199, 227, 0.5)' }; // Cyan
  }
  return { main: '#8DCC93', border: '#A3D9A9', glow: 'rgba(141, 204, 147, 0.5)' }; // Green (default)
};

// Get icon for node type
const getNodeIcon = (type: string) => {
  if (type.includes('BUILDING') || type.includes('PROJECT') || type.includes('SITE')) {
    return <Building2 className="w-5 h-5" />;
  }
  if (type.includes('SPACE') || type.includes('BUILDINGSTOREY')) {
    return <Home className="w-5 h-5" />;
  }
  if (type.includes('DISTRIBUTIONCONTROLELEMENT')) {
    return <Package className="w-5 h-5" />;
  }
  if (type.includes('SENSOR')) {
    return <Radio className="w-5 h-5" />;
  }
  return null;
};

export function DigitalTwinFlowGraph({ model, deviceMappings, onNodeClick }: DigitalTwinFlowGraphProps) {
  // Convert IFC model to React Flow nodes and edges
  const { nodes: flowNodes, edges: flowEdges } = useMemo(() => {
    if (!model || !model.root) {
      return { nodes: [], edges: [] };
    }

    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const levelWidth = new Map<number, number>();

    // Recursive function to build nodes with hierarchical layout
    const traverse = (node: IFCNodeType, level: number, parentX: number = 0, parentId?: string) => {
      const count = levelWidth.get(level) || 0;
      levelWidth.set(level, count + 1);

      const x = parentX + count * 200;
      const y = level * 150;
      
      const hasDevice = deviceMappings.has(node.id);
      
      // Create React Flow node
      const flowNode: Node = {
        id: node.id,
        type: 'default',
        position: { x, y },
        data: { 
          label: (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {getNodeIcon(node.type)}
              <span>{node.name}</span>
              {hasDevice && (
                <span className="ml-2 inline-block w-2 h-2 rounded-full bg-green-300" title="Device Mapped" />
              )}
            </div>
          ),
          ifcNode: node,
        },
        style: getNodeStyle(node.type, hasDevice),
      };
      
      nodes.push(flowNode);

      // Create edge from parent
      if (parentId) {
        edges.push({
          id: `${parentId}-${node.id}`,
          source: parentId,
          target: node.id,
          type: 'smoothstep',
          animated: false,
          style: { stroke: '#94a3b8', strokeWidth: 2 },
        });
      }

      // Recursively add children
      const childrenStartX = x - (node.children.length - 1) * 100;
      node.children.forEach((child, index) => {
        traverse(child, level + 1, childrenStartX + index * 200, node.id);
      });
    };

    traverse(model.root, 0);

    return { nodes, edges };
  }, [model, deviceMappings]);

  const [nodes, , onNodesChange] = useNodesState(flowNodes);
  const [edges, , onEdgesChange] = useEdgesState(flowEdges);

  // Handle node click
  const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    if (node.data.ifcNode) {
      onNodeClick(node.data.ifcNode);
    }
  }, [onNodeClick]);

  if (!model || flowNodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center">
          <Building2 className="w-12 h-12 mx-auto text-gray-400 mb-4" />
          <p className="text-gray-600">No building model loaded</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-gray-50">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        connectionMode={ConnectionMode.Loose}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{
          type: 'smoothstep',
          animated: false,
        }}
      >
        <Background color="#94a3b8" gap={16} />
        <Controls />
        <MiniMap 
          nodeColor={(node) => {
            const style = node.style as any;
            return style?.background || '#64748b';
          }}
          maskColor="rgba(0, 0, 0, 0.1)"
          position="bottom-right"
        />
        
        {/* Legend Panel */}
        <Panel position="top-left" className="bg-white p-4 rounded-lg shadow-lg">
          <h3 className="font-semibold text-sm mb-3 text-gray-900">Element Types</h3>
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-blue-600"></div>
              <span className="text-gray-700">Building / Site</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-purple-600"></div>
              <span className="text-gray-700">Floor / Space</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-orange-600"></div>
              <span className="text-gray-700">Edge Device</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-green-600"></div>
              <span className="text-gray-700">Sensor</span>
            </div>
            <div className="flex items-center gap-2 mt-3 pt-2 border-t">
              <div className="w-2 h-2 rounded-full bg-green-300"></div>
              <span className="text-gray-700">Device Mapped</span>
            </div>
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}

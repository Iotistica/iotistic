/**
 * Digital Twin Graph Visualization
 * Renders IFC building model as an interactive graph
 */

import React, { useEffect, useRef } from 'react';
import { IFCNode, IFCRelationship } from '../types/ifc';

interface DigitalTwinGraphProps {
  root?: IFCNode;
  relationships: IFCRelationship[];
  onNodeClick?: (node: IFCNode) => void;
  deviceMappings?: Map<string, string>; // RefId -> DeviceUUID
}

interface GraphNode {
  id: string;
  label: string;
  type: string;
  x: number;
  y: number;
  level: number;
  deviceUuid?: string;
}

export const DigitalTwinGraph: React.FC<DigitalTwinGraphProps> = ({
  root,
  relationships,
  onNodeClick,
  deviceMappings
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nodes, setNodes] = React.useState<GraphNode[]>([]);
  const [hoveredNode, setHoveredNode] = React.useState<GraphNode | null>(null);

  useEffect(() => {
    if (!root) return;

    // Build flat node list with positions
    const graphNodes: GraphNode[] = [];
    const levelWidth: Map<number, number> = new Map();

    const traverse = (node: IFCNode, level: number, parentX: number = 400) => {
      const count = levelWidth.get(level) || 0;
      levelWidth.set(level, count + 1);

      const x = parentX + (count - node.children.length / 2) * 150;
      const y = 80 + level * 120;

      const graphNode: GraphNode = {
        id: node.id,
        label: node.name,
        type: node.type,
        x,
        y,
        level,
        deviceUuid: deviceMappings?.get(node.id)
      };

      graphNodes.push(graphNode);

      node.children.forEach((child, idx) => {
        const childX = x + (idx - node.children.length / 2) * 150;
        traverse(child, level + 1, childX);
      });
    };

    traverse(root, 0);
    setNodes(graphNodes);
  }, [root, deviceMappings]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw relationships
    relationships.forEach(rel => {
      const source = nodes.find(n => n.id === rel.source);
      const target = nodes.find(n => n.id === rel.target);

      if (source && target) {
        ctx.beginPath();
        ctx.moveTo(source.x, source.y + 25);
        ctx.lineTo(target.x, target.y - 25);
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });

    // Draw nodes
    nodes.forEach(node => {
      const isHovered = hoveredNode?.id === node.id;
      const hasDevice = !!node.deviceUuid;

      // Node background
      ctx.fillStyle = getNodeColor(node.type, hasDevice);
      ctx.strokeStyle = isHovered ? '#3b82f6' : '#64748b';
      ctx.lineWidth = isHovered ? 3 : 2;

      roundRect(ctx, node.x - 60, node.y - 25, 120, 50, 8);
      ctx.fill();
      ctx.stroke();

      // Node icon
      ctx.font = '16px Arial';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(getNodeIcon(node.type), node.x - 35, node.y + 5);

      // Node label
      ctx.font = 'bold 12px Arial';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(
        node.label.length > 15 ? node.label.slice(0, 15) + '...' : node.label,
        node.x + 10,
        node.y + 5
      );

      // Device indicator
      if (hasDevice) {
        ctx.beginPath();
        ctx.arc(node.x + 50, node.y - 15, 6, 0, 2 * Math.PI);
        ctx.fillStyle = '#10b981';
        ctx.fill();
      }
    });
  }, [nodes, relationships, hoveredNode]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const node = nodes.find(
      n => x >= n.x - 60 && x <= n.x + 60 && y >= n.y - 25 && y <= n.y + 25
    );

    setHoveredNode(node || null);
    canvas.style.cursor = node ? 'pointer' : 'default';
  };

  const handleClick = () => {
    if (hoveredNode && onNodeClick) {
      // Find original node
      const findNode = (node: IFCNode): IFCNode | null => {
        if (node.id === hoveredNode.id) return node;
        for (const child of node.children) {
          const found = findNode(child);
          if (found) return found;
        }
        return null;
      };

      if (root) {
        const originalNode = findNode(root);
        if (originalNode) {
          onNodeClick(originalNode);
        }
      }
    }
  };

  return (
    <div className="relative bg-slate-50 rounded-lg border border-slate-200 overflow-hidden">
      <canvas
        ref={canvasRef}
        width={1200}
        height={800}
        className="w-full"
        onMouseMove={handleMouseMove}
        onClick={handleClick}
      />

      {hoveredNode && (
        <div
          className="absolute bg-slate-900 text-white px-3 py-2 rounded shadow-lg text-sm"
          style={{
            left: hoveredNode.x + 70,
            top: hoveredNode.y - 40,
            pointerEvents: 'none'
          }}
        >
          <div className="font-semibold">{hoveredNode.label}</div>
          <div className="text-slate-300 text-xs">{hoveredNode.type}</div>
          {hoveredNode.deviceUuid && (
            <div className="text-green-400 text-xs mt-1">
              ✓ Device Mapped
            </div>
          )}
        </div>
      )}

      <div className="absolute top-4 right-4 bg-white rounded-lg shadow p-3 text-xs space-y-2">
        <div className="font-semibold text-slate-700 mb-2">Legend</div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-blue-600"></div>
          <span>Building/Site</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-purple-600"></div>
          <span>Floor/Space</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-orange-600"></div>
          <span>Edge Device</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-green-600"></div>
          <span>Sensor</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500"></div>
          <span>Device Linked</span>
        </div>
      </div>
    </div>
  );
};

function getNodeColor(type: string, hasDevice: boolean): string {
  if (hasDevice) return '#059669'; // green-600 (brighter for linked devices)
  
  if (type.includes('PROJECT') || type.includes('SITE') || type.includes('BUILDING')) {
    return '#2563eb'; // blue-600
  }
  if (type.includes('STOREY') || type.includes('SPACE')) {
    return '#9333ea'; // purple-600
  }
  if (type.includes('DISTRIBUTION')) {
    return '#ea580c'; // orange-600
  }
  if (type.includes('SENSOR')) {
    return '#16a34a'; // green-600
  }
  return '#64748b'; // slate-500
}

function getNodeIcon(type: string): string {
  if (type.includes('PROJECT')) return '🏢';
  if (type.includes('SITE')) return '🌐';
  if (type.includes('BUILDING')) return '🏛️';
  if (type.includes('STOREY')) return '📐';
  if (type.includes('SPACE')) return '🚪';
  if (type.includes('DISTRIBUTION')) return '📡';
  if (type.includes('SENSOR')) return '📊';
  return '📦';
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

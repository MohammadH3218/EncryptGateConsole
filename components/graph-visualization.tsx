"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Minimize2,
  Play,
  Pause,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export interface GraphNode {
  id: string;
  label: string;
  type: "User" | "Email" | "URL";
  properties?: Record<string, any>;
  x?: number;
  y?: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  properties?: Record<string, any>;
  timestamp?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface GraphVisualizationProps {
  data: GraphData;
  className?: string;
  height?: number;
  onNodeClick?: (node: GraphNode) => void;
  onEdgeClick?: (edge: GraphEdge) => void;
}

export function GraphVisualization({
  data,
  className = "",
  height = 600,
  onNodeClick,
  onEdgeClick,
}: GraphVisualizationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const graphRef = useRef<Graph | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<GraphEdge | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const layoutRef = useRef<ReturnType<typeof forceAtlas2> | null>(null);

  // Initialize graph from data
  useEffect(() => {
    if (!canvasRef.current || !data.nodes.length) return;

    const graph = new Graph();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Add nodes
    data.nodes.forEach((node) => {
      if (!graph.hasNode(node.id)) {
        graph.addNode(node.id, {
          label: node.label,
          type: node.type,
          properties: node.properties || {},
          x: node.x || Math.random() * 400 + 200,
          y: node.y || Math.random() * 400 + 200,
          size: getNodeSize(node.type),
          color: getNodeColor(node.type),
        });
      }
    });

    // Add edges
    data.edges.forEach((edge) => {
      if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
        if (!graph.hasEdge(edge.source, edge.target)) {
          graph.addEdge(edge.source, edge.target, {
            type: edge.type,
            properties: edge.properties || {},
            timestamp: edge.timestamp,
            color: getEdgeColor(edge.type),
            width: 2,
          });
        }
      }
    });

    graphRef.current = graph;

    // Initialize layout with default settings
    const layout = forceAtlas2(graph, {
      iterations: 50,
      settings: {
        gravity: 1,
        scalingRatio: 1,
        strongGravityMode: false,
        barnesHutOptimize: true,
        barnesHutTheta: 0.5,
        edgeWeightInfluence: 1,
        adjustSizes: false,
        outboundAttractionDistribution: false,
        linLogMode: false,
      },
    });

    layoutRef.current = layout;

    // Set canvas size
    canvas.width = canvas.offsetWidth;
    canvas.height = height;

    return () => {
      if (layoutRef.current) {
        layoutRef.current.stop();
      }
    };
  }, [data, height]);

  // Animation loop
  useEffect(() => {
    if (!canvasRef.current || !graphRef.current || !isPlaying) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const animate = () => {
      if (layoutRef.current && isPlaying && graphRef.current) {
        layoutRef.current.step();
      }

      // Clear canvas
      ctx.fillStyle = "#121212";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Apply zoom and pan
      ctx.save();
      ctx.translate(canvas.width / 2 + pan.x, canvas.height / 2 + pan.y);
      ctx.scale(zoom, zoom);

      // Draw edges
      graphRef.current!.forEachEdge((edge, attributes, source, target) => {
        const sourceNode = graphRef.current!.getNodeAttributes(source);
        const targetNode = graphRef.current!.getNodeAttributes(target);

        ctx.strokeStyle = attributes.color || "#3B82F6";
        ctx.lineWidth = attributes.width || 2;
        ctx.globalAlpha = selectedEdge && edge === selectedEdge.id ? 1 : 0.4;

        ctx.beginPath();
        ctx.moveTo(sourceNode.x, sourceNode.y);
        ctx.lineTo(targetNode.x, targetNode.y);
        ctx.stroke();

        // Draw edge label if timestamp exists
        if (attributes.timestamp && selectedEdge && edge === selectedEdge.id) {
          ctx.save();
          ctx.globalAlpha = 1;
          ctx.fillStyle = "#E0E0E0";
          ctx.font = "10px Inter";
          const midX = (sourceNode.x + targetNode.x) / 2;
          const midY = (sourceNode.y + targetNode.y) / 2;
          ctx.fillText(
            new Date(attributes.timestamp).toLocaleTimeString(),
            midX,
            midY - 5
          );
          ctx.restore();
        }
      });

      // Draw nodes
      graphRef.current!.forEachNode((node, attributes) => {
        const isSelected = selectedNode?.id === node;

        // Node circle
        ctx.beginPath();
        ctx.arc(attributes.x, attributes.y, attributes.size, 0, Math.PI * 2);
        ctx.fillStyle = isSelected
          ? attributes.color
          : darkenColor(attributes.color, 0.3);
        ctx.fill();

        // Node border
        ctx.strokeStyle = isSelected ? "#3B82F6" : attributes.color;
        ctx.lineWidth = isSelected ? 3 : 1;
        ctx.stroke();

        // Node label
        ctx.fillStyle = "#E0E0E0";
        ctx.font = isSelected ? "12px Inter" : "11px Inter";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(
          attributes.label || node,
          attributes.x,
          attributes.y + attributes.size + 15
        );
      });

      ctx.restore();

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, zoom, pan, selectedNode, selectedEdge]);

  // Handle canvas interactions
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current || !graphRef.current) return;

      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left - canvas.width / 2 - pan.x) / zoom;
      const y = (e.clientY - rect.top - canvas.height / 2 - pan.y) / zoom;

      // Check for node click
      let clickedNode: string | null = null;
      graphRef.current.forEachNode((node, attributes) => {
        const dx = x - attributes.x;
        const dy = y - attributes.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance <= attributes.size) {
          clickedNode = node;
        }
      });

      if (clickedNode) {
        const nodeAttrs = graphRef.current.getNodeAttributes(clickedNode);
        const node: GraphNode = {
          id: clickedNode,
          label: nodeAttrs.label || clickedNode,
          type: nodeAttrs.type,
          properties: nodeAttrs.properties,
        };
        setSelectedNode(node);
        setSelectedEdge(null);
        onNodeClick?.(node);
      } else {
        setIsDragging(true);
        setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      }
    },
    [zoom, pan, onNodeClick]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (isDragging && canvasRef.current) {
        const newPan = {
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y,
        };
        setPan(newPan);
      }
    },
    [isDragging, dragStart]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom((prev) => Math.max(0.5, Math.min(3, prev * delta)));
    },
    []
  );

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setSelectedNode(null);
    setSelectedEdge(null);
  };

  const toggleFullscreen = () => {
    if (!isFullscreen) {
      canvasRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
    setIsFullscreen(!isFullscreen);
  };

  // Node type colors matching theme
  function getNodeColor(type: string): string {
    switch (type) {
      case "User":
        return "#3B82F6"; // accent-primary
      case "Email":
        return "#22C55E"; // success
      case "URL":
        return "#FACC15"; // warning
      default:
        return "#9E9E9E"; // muted
    }
  }

  function getNodeSize(type: string): number {
    switch (type) {
      case "User":
        return 20;
      case "Email":
        return 15;
      case "URL":
        return 12;
      default:
        return 10;
    }
  }

  function getEdgeColor(type: string): string {
    switch (type) {
      case "WAS_SENT":
        return "#3B82F6";
      case "WAS_SENT_TO":
        return "#22C55E";
      case "CONTAINS_URL":
        return "#FACC15";
      default:
        return "#9E9E9E";
    }
  }

  function darkenColor(color: string, factor: number): string {
    // Simple darkening for hex colors
    const hex = color.replace("#", "");
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    return `rgb(${Math.floor(r * factor)}, ${Math.floor(g * factor)}, ${Math.floor(b * factor)})`;
  }

  if (!data.nodes.length) {
    return (
      <Card className={`p-8 bg-app-surface border-app-border ${className}`}>
        <div className="text-center text-app-textSecondary">
          <Info className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No graph data to display</p>
        </div>
      </Card>
    );
  }

  return (
    <Card
      className={`relative bg-app-surface border-app-border overflow-hidden ${className}`}
    >
      {/* Controls */}
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setIsPlaying(!isPlaying)}
                className="h-8 w-8 bg-app-elevated border-app-border hover:bg-app-overlay"
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Toggle animation</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setZoom((z) => Math.min(3, z * 1.2))}
                className="h-8 w-8 bg-app-elevated border-app-border hover:bg-app-overlay"
              >
                <ZoomIn className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Zoom in</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setZoom((z) => Math.max(0.5, z * 0.8))}
                className="h-8 w-8 bg-app-elevated border-app-border hover:bg-app-overlay"
              >
                <ZoomOut className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Zoom out</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={resetView}
                className="h-8 w-8 bg-app-elevated border-app-border hover:bg-app-overlay"
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reset view</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={toggleFullscreen}
                className="h-8 w-8 bg-app-elevated border-app-border hover:bg-app-overlay"
              >
                {isFullscreen ? (
                  <Minimize2 className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Toggle fullscreen</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-10 flex flex-col gap-2">
        <div className="bg-app-elevated/95 backdrop-blur-sm border border-app-border rounded-lg p-3 space-y-2">
          <p className="text-xs font-semibold text-app-textPrimary mb-2">
            Node Types
          </p>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#3B82F6]" />
            <span className="text-xs text-app-textSecondary">User</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#22C55E]" />
            <span className="text-xs text-app-textSecondary">Email</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#FACC15]" />
            <span className="text-xs text-app-textSecondary">URL</span>
          </div>
        </div>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full cursor-grab active:cursor-grabbing"
        style={{ height: `${height}px` }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      />

      {/* Node info panel */}
      {selectedNode && (
        <div className="absolute top-4 left-4 z-10 bg-app-elevated/95 backdrop-blur-sm border border-app-border rounded-lg p-4 max-w-xs">
          <div className="flex items-start justify-between mb-2">
            <h3 className="text-sm font-semibold text-app-textPrimary">
              {selectedNode.label}
            </h3>
            <Badge
              variant="outline"
              className="text-xs"
              style={{
                borderColor: getNodeColor(selectedNode.type),
                color: getNodeColor(selectedNode.type),
              }}
            >
              {selectedNode.type}
            </Badge>
          </div>
          {selectedNode.properties && (
            <div className="mt-2 space-y-1">
              {Object.entries(selectedNode.properties).map(([key, value]) => (
                <div key={key} className="text-xs">
                  <span className="text-app-textSecondary">{key}:</span>{" "}
                  <span className="text-app-textPrimary font-mono">
                    {String(value).slice(0, 50)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}


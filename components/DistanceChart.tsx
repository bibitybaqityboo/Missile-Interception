import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { HistoryPoint } from '../types';

interface DistanceChartProps {
  data: HistoryPoint[];
}

export const DistanceChart: React.FC<DistanceChartProps> = ({ data }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || data.length === 0) return;

    const width = containerRef.current.clientWidth;
    const height = 150;
    const margin = { top: 10, right: 10, bottom: 20, left: 30 };

    // Clear previous
    d3.select(svgRef.current).selectAll("*").remove();

    const svg = d3.select(svgRef.current)
      .attr("width", width)
      .attr("height", height)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Scales
    const xScale = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.time) || 10])
      .range([0, innerWidth]);

    const yScale = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.distance) || 100])
      .range([innerHeight, 0]);

    // Line
    const line = d3.line<HistoryPoint>()
      .x(d => xScale(d.time))
      .y(d => yScale(d.distance))
      .curve(d3.curveMonotoneX);

    // Axes
    svg.append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale).ticks(5).tickSizeOuter(0))
      .attr("color", "#64748b")
      .style("font-family", "monospace");

    svg.append("g")
      .call(d3.axisLeft(yScale).ticks(4))
      .attr("color", "#64748b")
      .style("font-family", "monospace");

    // Path
    svg.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "#10b981")
      .attr("stroke-width", 2)
      .attr("d", line);

    // Area (optional, for aesthetics)
    const area = d3.area<HistoryPoint>()
      .x(d => xScale(d.time))
      .y0(innerHeight)
      .y1(d => yScale(d.distance))
      .curve(d3.curveMonotoneX);

    svg.append("path")
      .datum(data)
      .attr("fill", "rgba(16, 185, 129, 0.1)")
      .attr("d", area);

  }, [data]);

  return (
    <div ref={containerRef} className="w-full">
      <div className="text-xs text-slate-400 mb-1 font-mono uppercase tracking-wider">Target Separation (m)</div>
      <svg ref={svgRef}></svg>
    </div>
  );
};

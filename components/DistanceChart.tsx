import React, { useEffect, useId, useRef, useState } from 'react';
import * as d3 from 'd3';
import { HistoryPoint } from '../types';
import { KILL_RADIUS } from '../simulation';

interface DistanceChartProps {
  data: HistoryPoint[];
  /** Range at launch; fixes the y-axis so the curve doesn't rescale as it falls. */
  initialDistance: number;
  height?: number;
}

export const DistanceChart: React.FC<DistanceChartProps> = ({ data, initialDistance, height = 140 }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const gradientId = `sep-fill-${useId().replace(/:/g, '')}`;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!svgRef.current || width === 0) return;
    const margin = { top: 8, right: 10, bottom: 20, left: 34 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const root = d3.select(svgRef.current);
    root.selectAll('*').remove();
    root.attr('width', width).attr('height', height);

    const defs = root.append('defs');
    const gradient = defs.append('linearGradient').attr('id', gradientId).attr('x1', 0).attr('x2', 0).attr('y1', 0).attr('y2', 1);
    gradient.append('stop').attr('offset', '0%').attr('stop-color', '#34d399').attr('stop-opacity', 0.35);
    gradient.append('stop').attr('offset', '100%').attr('stop-color', '#34d399').attr('stop-opacity', 0);

    const svg = root.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const maxTime = Math.max(5, d3.max(data, (d) => d.time) ?? 0);
    const maxDist = Math.max(initialDistance, d3.max(data, (d) => d.distance) ?? 0) * 1.05;
    const x = d3.scaleLinear().domain([0, maxTime]).range([0, innerWidth]);
    const y = d3.scaleLinear().domain([0, maxDist]).range([innerHeight, 0]).nice();

    // Horizontal guides
    svg.append('g')
      .selectAll('line')
      .data(y.ticks(4))
      .join('line')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', (d) => y(d))
      .attr('y2', (d) => y(d))
      .attr('stroke', 'rgb(148 163 184 / 0.08)');

    // Kill radius band
    svg.append('rect')
      .attr('x', 0)
      .attr('width', innerWidth)
      .attr('y', y(KILL_RADIUS))
      .attr('height', innerHeight - y(KILL_RADIUS))
      .attr('fill', 'rgb(251 113 133 / 0.12)');
    svg.append('line')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', y(KILL_RADIUS))
      .attr('y2', y(KILL_RADIUS))
      .attr('stroke', '#fb7185')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-dasharray', '3 3');
    svg.append('text')
      .attr('x', innerWidth - 2)
      .attr('y', y(KILL_RADIUS) - 3)
      .attr('text-anchor', 'end')
      .attr('fill', '#fb7185')
      .attr('fill-opacity', 0.75)
      .style('font', '600 8px var(--font-mono)')
      .style('letter-spacing', '0.12em')
      .text('KILL RADIUS');

    const axisStyle = (g: d3.Selection<SVGGElement, unknown, null, undefined>) => {
      g.attr('color', '#64748b').style('font-family', 'var(--font-mono)').style('font-size', '9px');
      g.select('.domain').remove();
      g.selectAll('.tick line').attr('stroke-opacity', 0.4);
    };
    svg.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x).ticks(5).tickSize(3).tickFormat((d) => `${d}s`))
      .call(axisStyle);
    svg.append('g')
      .call(d3.axisLeft(y).ticks(4).tickSize(3))
      .call(axisStyle);

    if (data.length === 0) return;

    const area = d3.area<HistoryPoint>()
      .x((d) => x(d.time))
      .y0(innerHeight)
      .y1((d) => y(d.distance))
      .curve(d3.curveMonotoneX);
    const line = d3.line<HistoryPoint>()
      .x((d) => x(d.time))
      .y((d) => y(d.distance))
      .curve(d3.curveMonotoneX);

    svg.append('path').datum(data).attr('fill', `url(#${gradientId})`).attr('d', area);
    svg.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', '#34d399')
      .attr('stroke-width', 1.75)
      .attr('stroke-linejoin', 'round')
      .attr('d', line);

    const last = data[data.length - 1];
    svg.append('circle').attr('cx', x(last.time)).attr('cy', y(last.distance)).attr('r', 6).attr('fill', 'rgb(52 211 153 / 0.2)');
    svg.append('circle').attr('cx', x(last.time)).attr('cy', y(last.distance)).attr('r', 2.75).attr('fill', '#6ee7b7');
  }, [data, width, height, initialDistance, gradientId]);

  return (
    <div ref={containerRef} className="relative w-full" style={{ height }}>
      <svg ref={svgRef} className="block" role="img" aria-label="Target separation over time" />
      {data.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center pl-8 pb-4 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-600">
          Awaiting launch
        </div>
      )}
    </div>
  );
};

'use client';

/**
 * DashboardCharts — 2 chart visualization untuk dashboard.
 *
 * 1. Bar chart: Total Items per BU
 * 2. Doughnut: Inventory Value share per BU
 *
 * Pakai chart.js + react-chartjs-2. Theme aware (light/dark).
 */

import { useEffect, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import type { BuSummary } from '@/lib/dashboard';
import { formatCurrency } from '@/lib/utils';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend);

const COLORS = [
  'rgba(37, 99, 235, 0.8)',   // primary blue
  'rgba(239, 68, 68, 0.8)',   // red
  'rgba(34, 197, 94, 0.8)',   // green
  'rgba(245, 158, 11, 0.8)',  // amber
  'rgba(168, 85, 247, 0.8)',  // purple
  'rgba(14, 165, 233, 0.8)',  // sky
];

const COLORS_BORDER = COLORS.map((c) => c.replace('0.8', '1'));

export function DashboardCharts({ bus }: { bus: BuSummary[] }) {
  const [textColor, setTextColor] = useState('#1e293b');

  useEffect(() => {
    // Detect dark mode dari class body
    const update = () => {
      const isDark = document.body.classList.contains('dark-mode');
      setTextColor(isDark ? '#e2e8f0' : '#1e293b');
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const valid = bus.filter((b) => !b.error);
  if (valid.length === 0) return null;

  // Bar chart: Total Items per BU
  const barData = {
    labels: valid.map((b) => b.bu),
    datasets: [
      {
        label: 'Total Items',
        data: valid.map((b) => b.total_items),
        backgroundColor: 'rgba(37, 99, 235, 0.6)',
        borderColor: 'rgba(37, 99, 235, 1)',
        borderWidth: 2,
        borderRadius: 8,
      },
      {
        label: 'Low Stock',
        data: valid.map((b) => b.low_stock_count),
        backgroundColor: 'rgba(239, 68, 68, 0.6)',
        borderColor: 'rgba(239, 68, 68, 1)',
        borderWidth: 2,
        borderRadius: 8,
      },
    ],
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' as const, labels: { color: textColor } },
      title: { display: true, text: 'Items per BU', color: textColor, font: { size: 14, weight: 'bold' as const } },
    },
    scales: {
      y: { beginAtZero: true, ticks: { color: textColor }, grid: { color: 'rgba(148, 163, 184, 0.2)' } },
      x: { ticks: { color: textColor }, grid: { display: false } },
    },
  };

  // Doughnut: Inventory Value share per BU
  const doughnutData = {
    labels: valid.map((b) => b.bu),
    datasets: [
      {
        label: 'Inventory Value',
        data: valid.map((b) => b.inventory_value),
        backgroundColor: COLORS.slice(0, valid.length),
        borderColor: COLORS_BORDER.slice(0, valid.length),
        borderWidth: 2,
      },
    ],
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom' as const, labels: { color: textColor, padding: 12 } },
      title: {
        display: true,
        text: 'Distribusi Nilai Inventory',
        color: textColor,
        font: { size: 14, weight: 'bold' as const },
      },
      tooltip: {
        callbacks: {
          label: (ctx: { label: string; parsed: number; dataset: { data: number[] } }) => {
            const total = ctx.dataset.data.reduce((s: number, v: number) => s + v, 0);
            const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : '0';
            return `${ctx.label}: ${formatCurrency(ctx.parsed)} (${pct}%)`;
          },
        },
      },
    },
    cutout: '60%',
  };

  return (
    <div className="grid md:grid-cols-2 gap-4 mb-4">
      <div className="card" style={{ height: 320 }}>
        <Bar data={barData} options={barOptions} />
      </div>
      <div className="card" style={{ height: 320 }}>
        <Doughnut data={doughnutData} options={doughnutOptions} />
      </div>
    </div>
  );
}

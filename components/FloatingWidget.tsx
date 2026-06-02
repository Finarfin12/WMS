'use client';

import { useState, useEffect, useRef } from 'react';
import { Calculator, Package, X, MagnifyingGlass, ArrowsClockwise, Notepad } from '@phosphor-icons/react';
import { getStock, type StockGetResult } from '@/lib/stock';
import { getCurrentUser } from '@/lib/auth';

export function FloatingWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'calc' | 'stock' | 'note'>('calc');
  const [position, setPosition] = useState({ x: -1, y: -1 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; initX: number; initY: number }>({
    startX: 0, startY: 0, initX: 0, initY: 0
  });

  // Calculator state
  const [calcInput, setCalcInput] = useState('');
  
  // Note state
  const [noteInput, setNoteInput] = useState('');

  // Stock state
  const [bu, setBu] = useState('');
  const [search, setSearch] = useState('');
  const [stockResult, setStockResult] = useState<StockGetResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const user = getCurrentUser();
    if (user) {
      const savedNote = localStorage.getItem(`wms_sticky_${user.email}`);
      if (savedNote) setNoteInput(savedNote);
    }
  }, []);

  const handleNoteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setNoteInput(val);
    const user = getCurrentUser();
    if (user) {
      localStorage.setItem(`wms_sticky_${user.email}`, val);
    }
  };

  useEffect(() => {
    const initial = localStorage.getItem('wms_active_bu') || '';
    setBu(initial);
    const handler = (e: Event) => setBu((e as CustomEvent<string>).detail);
    window.addEventListener('bu-changed', handler);
    return () => window.removeEventListener('bu-changed', handler);
  }, []);

  // Initialize position to bottom right corner once on client
  useEffect(() => {
    setPosition({ x: window.innerWidth - 320 - 24, y: window.innerHeight - 450 - 24 });
  }, []);

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (!isDragging) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      let newX = dragRef.current.initX + dx;
      let newY = dragRef.current.initY + dy;
      
      // Keep within bounds
      if (newX < 0) newX = 0;
      if (newY < 0) newY = 0;
      if (newX > window.innerWidth - 320) newX = window.innerWidth - 320;
      if (newY > window.innerHeight - 50) newY = window.innerHeight - 50;

      setPosition({ x: newX, y: newY });
    }
    function handleMouseUp() {
      setIsDragging(false);
    }
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const handleDragStart = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).tagName === 'BUTTON' || (e.target as HTMLElement).tagName === 'INPUT') return;
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initX: position.x,
      initY: position.y
    };
  };

  const handleCalculate = () => {
    try {
      // Very basic safe eval replacing non-math characters
      const sanitized = calcInput.replace(/[^-()\d/*+.]/g, '');
      // eslint-disable-next-line no-eval
      const res = eval(sanitized);
      setCalcInput(String(res));
    } catch {
      setCalcInput('Error');
    }
  };

  const searchStock = async () => {
    if (!bu || !search.trim()) return;
    setLoading(true);
    try {
      const res = await getStock({ bu, search, limit: 10 });
      setStockResult(res);
    } catch (err) {
      // Ignore
    } finally {
      setLoading(false);
    }
  };

  if (position.x === -1) return null; // Wait for mount

  if (!isOpen) {
    return (
      <div className="fixed bottom-6 right-6 z-[9999] group">
        <span className="absolute inset-0 rounded-full bg-primary/40 animate-ping"></span>
        <button
          onClick={() => setIsOpen(true)}
          className="relative p-4 rounded-full bg-primary text-white shadow-[0_8px_30px_rgb(0,0,0,0.2)] hover:bg-primary-hover hover:scale-110 transition-transform"
          title="Buka Kalkulator & Cek Stok"
        >
          <Calculator size={28} weight="duotone" />
        </button>
      </div>
    );
  }

  return (
    <div
      className="fixed z-[9999] w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl rounded-xl overflow-hidden flex flex-col transition-shadow ring-1 ring-black/5"
      style={{ left: position.x, top: position.y, height: 450 }}
    >
      {/* Header / Drag Handle */}
      <div 
        className="bg-slate-100 dark:bg-slate-800 p-3 flex justify-between items-center cursor-move border-b border-slate-200 dark:border-slate-700"
        onMouseDown={handleDragStart}
      >
        <div className="flex gap-2 font-semibold text-sm">
          <button 
            className={`px-3 py-1.5 rounded-md transition-colors ${activeTab === 'calc' ? 'bg-primary text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white'}`}
            onClick={() => setActiveTab('calc')}
          >
            <Calculator size={16} className="inline mr-1" weight="duotone" /> Calc
          </button>
          <button 
            className={`px-3 py-1.5 rounded-md transition-colors ${activeTab === 'stock' ? 'bg-primary text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white'}`}
            onClick={() => setActiveTab('stock')}
          >
            <Package size={16} className="inline mr-1" weight="duotone" /> Stock
          </button>
          <button 
            className={`px-3 py-1.5 rounded-md transition-colors ${activeTab === 'note' ? 'bg-primary text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white'}`}
            onClick={() => setActiveTab('note')}
          >
            <Notepad size={16} className="inline mr-1" weight="duotone" /> Note
          </button>
        </div>
        <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-red-500 transition-colors p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700">
          <X size={20} weight="bold" />
        </button>
      </div>

      {/* Content */}
      <div className="p-4 flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-900/50">
        {activeTab === 'calc' ? (
          <div className="flex flex-col h-full">
            <input 
              type="text" 
              value={calcInput}
              onChange={(e) => setCalcInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCalculate()}
              className="w-full text-right text-3xl font-light p-4 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg mb-4 shadow-inner text-slate-800 dark:text-slate-100"
              placeholder="0"
            />
            <div className="grid grid-cols-4 gap-2 flex-1">
              {['7','8','9','/','4','5','6','*','1','2','3','-','C','0','.','+'].map((btn) => (
                <button
                  key={btn}
                  onClick={() => {
                    if (btn === 'C') setCalcInput('');
                    else setCalcInput(prev => prev === 'Error' ? btn : prev + btn);
                  }}
                  className={`rounded-lg text-lg font-mono font-semibold transition-transform active:scale-95 ${
                    ['/','*','-','+'].includes(btn) 
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800/60'
                      : btn === 'C'
                      ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-800/60'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700'
                  }`}
                >
                  {btn}
                </button>
              ))}
              <button 
                className="col-span-4 bg-primary hover:bg-primary-hover text-white rounded-lg py-3 font-bold mt-2 shadow-md active:scale-[0.98] transition-transform"
                onClick={handleCalculate}
              >
                =
              </button>
            </div>
          </div>
        ) : activeTab === 'note' ? (
          <div className="flex flex-col h-full">
            <textarea
              className="flex-1 w-full p-4 bg-[#fff7d1] dark:bg-yellow-900/20 text-slate-800 dark:text-yellow-100 placeholder-slate-500 dark:placeholder-yellow-700/50 rounded-lg shadow-inner resize-none focus:outline-none focus:ring-1 focus:ring-yellow-400 border border-transparent focus:border-yellow-400 leading-relaxed font-medium"
              placeholder="Tulis catatan (otomatis tersimpan untuk akun Anda)..."
              value={noteInput}
              onChange={handleNoteChange}
            />
          </div>
        ) : (
          <div className="flex flex-col h-full">
            <div className="flex gap-2 mb-4">
              <input 
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchStock()}
                placeholder="Cari barang..."
                className="form-control flex-1 text-sm"
              />
              <button onClick={searchStock} className="btn btn-primary px-3">
                <MagnifyingGlass size={16} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto pr-1">
              {loading ? (
                <div className="flex justify-center p-4"><ArrowsClockwise className="animate-spin text-primary" size={24}/></div>
              ) : stockResult?.items.length === 0 ? (
                <p className="text-center text-muted text-sm mt-4">Tidak ditemukan</p>
              ) : (
                <div className="space-y-2">
                  {stockResult?.items.map((item, i) => (
                    <div key={i} className="p-2 border border-slate-800 rounded bg-slate-900 text-sm">
                      <div className="font-semibold">{item.nama}</div>
                      <div className="flex justify-between mt-1 text-slate-400 text-xs">
                        <span>{[item.warna, item.ukuran, item.lebar].filter(Boolean).join(' / ')}</span>
                        <span className="font-bold text-white bg-slate-700 px-1.5 rounded">{item.stok}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

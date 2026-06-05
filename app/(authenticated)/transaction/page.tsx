'use client';

/**
 * Transaction — input form + list transaksi terkini.
 *
 * Phase 6 updates:
 *   - UI-1: Cascading dropdown Atrione (material → ukuran → warna) via masterData.options
 *   - UI-2: Datalist/Dropdown Lebar & Warna via masterData.options
 *   - UI-6: Display tanggal pakai formatDateDmy (DD/MM/YYYY)
 *   - UI-7: Input harga auto-format Indonesia (parseHargaID + formatHargaDisplay)
 *   - Outbound redesign: Checkbox-based current stock checklist per user preference
 */

import { useEffect, useState, useCallback } from 'react';
import { Receipt, Plus, ArrowsClockwise, ArrowDown, ArrowUp, ListBullets, Warning, X } from '@phosphor-icons/react';
import { saveTransaction, batchOutbound } from '@/lib/transaction';
import { searchHistory, type HistoryItem } from '@/lib/history';
import { listBus, getBuFlags, type BUConfig } from '@/lib/bu-registry';
import { getMasterDataOptions, listMasterData } from '@/lib/master-data';
import { getStock, type StockItem } from '@/lib/stock';
import { RadialLoading } from '@/lib/RadialLoading';
import { toast, alertError, withLoading } from '@/lib/swal';
import { formatDateDmy, parseHargaID, formatHargaDisplay } from '@/lib/utils';
import Link from 'next/link';
import ModalMasterData from '@/components/ModalMasterData';


interface OutboundRowInput {
  checked: boolean;
  qty: string;
  uom: string;
  diskon: string;
  keterangan: string;
}

export default function TransactionPage() {
  const [bu, setBu] = useState('');
  const [txModalType, setTxModalType] = useState<'masuk' | 'keluar' | null>(null);
  const [buConfig, setBuConfig] = useState<BUConfig | null>(null);
  const [recent, setRecent] = useState<HistoryItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [filterListDate, setFilterListDate] = useState('');
  const [filterListSearch, setFilterListSearch] = useState('');

  // === Dropdowns & Datalists options ===
  const [materialOptions, setMaterialOptions] = useState<string[]>([]);
  const [ukuranOptions, setUkuranOptions] = useState<string[]>([]);
  const [warnaOptions, setWarnaOptions] = useState<string[]>([]);
  const [lebarOptions, setLebarOptions] = useState<string[]>([]);
  const [customerOptions, setCustomerOptions] = useState<string[]>([]);
  const [paymentOptions, setPaymentOptions] = useState<string[]>([]);
  
  const [optionsLoading, setOptionsLoading] = useState({ material: false, ukuran: false, warna: false, lebar: false, customers: false, payments: false });
  const [optionsCache, setOptionsCache] = useState<Record<string, string[]>>({});

  // === Inbound Form State ===
  const [form, setForm] = useState({
    tanggal: new Date().toISOString().slice(0, 10),
    nama: '',
    warna: '',
    ukuran: '',
    lebar: '',
    uom: '',
    qty: '',
    hargaDisplay: '',
    harga: '',   // actual number value
    hppDisplay: '',
    hpp: '',
    diskon: '',
    customer: '',
    no_sj: '',
    keterangan: '',
  });

  // === Outbound Form State (SJ Header + Stock Table) ===
  const [header, setHeader] = useState({
    no_sj: `SJ-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`,
    tanggal: new Date().toISOString().slice(0, 10),
    customer: '',
    no_po: '',
    remarks: '',
    payment_method: '',
    delivery_date: '',
    resi: '',
    courier: '',
    delivery_costDisplay: '',
    delivery_cost: '',
  });

  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [loadingStock, setLoadingStock] = useState(false);
  const [outboundInputs, setOutboundInputs] = useState<Record<string, OutboundRowInput>>({});
  
  // === Outbound UI states ===
  const [showPakta, setShowPakta] = useState(false);
  const [paktaChecked, setPaktaChecked] = useState(false);
  const [paktaConfirmed, setPaktaConfirmed] = useState(false);

  // === Modal State ===
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState('');
  const openModal = (type: string) => {
    setModalType(type);
    setModalOpen(true);
  };
  const handleModalSuccess = (newName: string) => {
    if (modalType === 'Produk Baru' || modalType === 'Material Baru') {
      setMaterialOptions(prev => [...new Set([...prev, newName])]);
      setForm(f => ({ ...f, nama: newName }));
    } else if (modalType === 'Customer Baru') {
      setCustomerOptions(prev => [...new Set([...prev, newName])]);
      setForm(f => ({ ...f, customer: newName }));
      setHeader(h => ({ ...h, customer: newName }));
    } else if (modalType === 'Payment Method') {
      setPaymentOptions(prev => [...new Set([...prev, newName])]);
      setHeader(h => ({ ...h, payment_method: newName }));
    }
  };

  // Sync BU
  useEffect(() => {
    const initial = localStorage.getItem('wms_active_bu') || '';
    setBu(initial);

    const handler = (e: Event) => {
      const newBu = (e as CustomEvent<string>).detail;
      setBu(newBu);
      // Reset forms
      setForm((f) => ({
        ...f,
        nama: '',
        warna: '',
        ukuran: '',
        lebar: '',
        qty: '',
        hargaDisplay: '',
        harga: '',
        hppDisplay: '',
        hpp: '',
        diskon: '',
        customer: '',
        no_sj: '',
        keterangan: '',
      }));
      setHeader({
        no_sj: `SJ-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`,
        tanggal: new Date().toISOString().slice(0, 10),
        customer: '',
        no_po: '',
        remarks: '',
        payment_method: '',
        delivery_date: '',
        resi: '',
        courier: '',
        delivery_costDisplay: '',
        delivery_cost: '',
      });
      setOutboundInputs({});
      setMaterialOptions([]);
      setUkuranOptions([]);
      setWarnaOptions([]);
      setLebarOptions([]);
    };
    window.addEventListener('bu-changed', handler);
    return () => window.removeEventListener('bu-changed', handler);
  }, []);

  // Load BU config + options
  useEffect(() => {
    if (!bu) return;
    listBus()
      .then(async (bus) => {
        const found = bus.find((b) => b.bu_name === bu);
        if (found) {
          setBuConfig(found);
          setForm((f) => ({ ...f, uom: found.default_uom || '' }));

          const isAtrione = found.bu_id === 'atrione';
          const isCanvas = found.bu_id === 'canvas';

          // Preload master data options
          // Load Product/Material list
          setOptionsLoading((o) => ({ ...o, material: true }));
          try {
            const mType = isAtrione ? 'Produk Baru' : 'Material Baru';
            const items = await listMasterData({ bu: found.bu_name, tipe: mType });
            const uniqueNames = Array.from(new Set(items.map((i) => i.Nama)));
            setMaterialOptions(uniqueNames);
          } catch { /* ignore */ }
          setOptionsLoading((o) => ({ ...o, material: false }));

          // Load Customer list
          setOptionsLoading((o) => ({ ...o, customers: true }));
          try {
            const items = await listMasterData({ bu: found.bu_name, tipe: 'Customer Baru' });
            const uniqueCustomers = Array.from(new Set(items.map((i) => i.Nama)));
            setCustomerOptions(uniqueCustomers);
          } catch { /* ignore */ }
          setOptionsLoading((o) => ({ ...o, customers: false }));

          // Load Payment Methods (Atrione only)
          if (isAtrione) {
            setOptionsLoading((o) => ({ ...o, payments: true }));
            try {
              const items = await listMasterData({ bu: found.bu_name, tipe: 'Payment Method' });
              const uniquePayments = Array.from(new Set(items.map((i) => i.Nama)));
              setPaymentOptions(uniquePayments);
            } catch { /* ignore */ }
            setOptionsLoading((o) => ({ ...o, payments: false }));
          }

          // Preload warna for non-Atrione
          if (found.has_color && !isAtrione) {
            setOptionsLoading((o) => ({ ...o, warna: true }));
            try {
              const result = await getMasterDataOptions({ bu: found.bu_name, child_field: 'Warna' });
              setWarnaOptions(result.values);
            } catch { /* ignore */ }
            setOptionsLoading((o) => ({ ...o, warna: false }));
          }

          // Preload lebar for Canvas
          if (found.has_width && isCanvas) {
            setOptionsLoading((o) => ({ ...o, lebar: true }));
            try {
              const result = await getMasterDataOptions({ bu: found.bu_name, child_field: 'Lebar' });
              setLebarOptions(result.values);
            } catch { /* ignore */ }
            setOptionsLoading((o) => ({ ...o, lebar: false }));
          }
        }
      })
      .catch((err) => alertError(err));
  }, [bu]);

  // Load stock list for outbound
  const loadStock = useCallback(async () => {
    if (!bu) return;
    setLoadingStock(true);
    try {
      const result = await getStock({ bu, include_zero: false });
      setStockItems(result.items);
    } catch (err) {
      alertError(err, 'Gagal memuat stok barang');
    } finally {
      setLoadingStock(false);
    }
  }, [bu]);

  useEffect(() => {
    if (bu && txModalType === 'keluar') {
      loadStock();
    }
  }, [bu, txModalType, loadStock]);

  // === UI-1: Cascading Atrione ===
  // Material berubah → fetch ukuran
  useEffect(() => {
    if (!buConfig || buConfig.bu_id !== 'atrione' || !form.nama) {
      setUkuranOptions([]);
      setWarnaOptions([]);
      setForm((f) => ({ ...f, ukuran: '', warna: '' }));
      return;
    }
    const cacheKey = `ukuran:${form.nama}`;
    if (optionsCache[cacheKey]) {
      setUkuranOptions(optionsCache[cacheKey]);
      return;
    }
    setOptionsLoading((o) => ({ ...o, ukuran: true }));
    getMasterDataOptions({
      bu: buConfig.bu_name,
      parent_field: 'Nama',
      parent_value: form.nama,
      child_field: 'Ukuran',
    })
      .then((res) => {
        setUkuranOptions(res.values);
        setOptionsCache((c) => ({ ...c, [cacheKey]: res.values }));
      })
      .catch(() => setUkuranOptions([]))
      .finally(() => setOptionsLoading((o) => ({ ...o, ukuran: false })));
  }, [form.nama, buConfig]);

  // Ukuran berubah → fetch warna
  useEffect(() => {
    if (!buConfig || buConfig.bu_id !== 'atrione' || !form.ukuran) {
      setWarnaOptions([]);
      setForm((f) => ({ ...f, warna: '' }));
      return;
    }
    const cacheKey = `warna:${form.nama}:${form.ukuran}`;
    if (optionsCache[cacheKey]) {
      setWarnaOptions(optionsCache[cacheKey]);
      return;
    }
    setOptionsLoading((o) => ({ ...o, warna: true }));
    getMasterDataOptions({
      bu: buConfig.bu_name,
      parent_field: 'Ukuran',
      parent_value: form.ukuran,
      child_field: 'Warna',
    })
      .then((res) => {
        setWarnaOptions(res.values);
        setOptionsCache((c) => ({ ...c, [cacheKey]: res.values }));
      })
      .catch(() => setWarnaOptions([]))
      .finally(() => setOptionsLoading((o) => ({ ...o, warna: false })));
  }, [form.ukuran, buConfig]);

  // Load recent transactions
  const loadRecent = useCallback(async () => {
    if (!bu) return;
    setLoadingList(true);
    try {
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 30);
      const result = await searchHistory({
        bu,
        from: fromDate.toISOString().slice(0, 10),
        to: new Date().toISOString().slice(0, 10),
        limit: 50,
      });
      setRecent(result.items);
    } catch (err) {
      alertError(err);
    } finally {
      setLoadingList(false);
    }
  }, [bu]);

  useEffect(() => {
    if (bu) loadRecent();
  }, [bu, loadRecent]);

  // Unique keys for stock item checklist
  const getStockItemKey = useCallback((item: StockItem, buId: string) => {
    if (buId === 'atrione') {
      return `${item.nama}-${item.warna || ''}-${item.ukuran || ''}`;
    }
    if (buId === 'canvas') {
      return `${item.nama}-${item.warna || ''}-${item.lebar || ''}`;
    }
    return item.nama; // chemical (grouped by name)
  }, []);

  const handleOutboundCheckboxChange = (key: string, checked: boolean) => {
    setOutboundInputs((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || { qty: '', uom: '', diskon: '0', keterangan: '' }),
        checked,
      },
    }));
  };

  const handleOutboundInputChange = (key: string, field: keyof OutboundRowInput, value: string) => {
    setOutboundInputs((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || { checked: false, qty: '', uom: '', diskon: '0', keterangan: '' }),
        [field]: value,
      },
    }));
  };

  // Submit Inbound (Barang Masuk)
  async function handleSubmitMasuk(e: React.FormEvent) {
    e.preventDefault();
    if (!bu || !form.nama || !form.qty) {
      toast('Nama dan Quantity wajib diisi', 'error');
      return;
    }

    const qty = parseFloat(form.qty);
    if (qty <= 0) {
      toast('Quantity harus > 0', 'error');
      return;
    }

    const userData = JSON.parse(localStorage.getItem('wms_user') || '{}');
    const userEmail = userData.username || userData.email || 'unknown';

    const result = await withLoading(
      () =>
        saveTransaction({
          bu,
          tanggal: form.tanggal,
          nama: form.nama,
          uom: form.uom,
          masuk: qty,
          keluar: 0,
          warna: form.warna || undefined,
          ukuran: form.ukuran || undefined,
          lebar: form.lebar || undefined,
          harga: form.harga ? parseFloat(form.harga) : (form.hargaDisplay ? parseHargaID(form.hargaDisplay) : undefined),
          hpp: form.hpp ? parseFloat(form.hpp) : (form.hppDisplay ? parseHargaID(form.hppDisplay) : undefined),
          diskon: form.diskon ? parseFloat(form.diskon) : undefined,
          customer: form.customer || undefined,
          no_sj: form.no_sj || undefined,
          keterangan: form.keterangan || undefined,
          user: userEmail,
        }),
      {
        loadingText: 'Menyimpan transaksi masuk…',
      },
    );

    if (result) {
      if (result.ok) {
        toast(`Transaksi masuk tersimpan (ID: ${result.data.id})`, 'success');
      } else {
        toast(
          `Backend down — masuk antrian (id: ${result.queue_id}), akan ter-sync otomatis`,
          'warning',
        );
      }
      // Reset form (keep tanggal + uom)
      setForm({
        tanggal: form.tanggal,
        nama: '',
        warna: '',
        ukuran: '',
        lebar: '',
        uom: form.uom,
        qty: '',
        harga: '',
        hargaDisplay: '',
        hpp: '',
        hppDisplay: '',
        diskon: '',
        customer: '',
        no_sj: '',
        keterangan: '',
      });
      setTxModalType(null);
      loadRecent();
    }
  }

  // Submit Outbound (Barang Keluar)
  async function handleSubmitKeluar(e?: React.FormEvent, skipPaktaCheck = false) {
    if (e) e.preventDefault();
    if (!bu || !buConfig) return;

    if (!header.customer || !header.no_sj || !header.tanggal) {
      toast('Mohon lengkapi Data Surat Jalan (Customer, Nomor, Tanggal)', 'error');
      return;
    }

    const buId = buConfig.bu_id;

    // Consolidated display rows for Chemical, normal for others
    let displayItems = stockItems;
    if (buId === 'chemical') {
      const grouped: Record<string, StockItem> = {};
      stockItems.forEach((item) => {
        if (!grouped[item.nama]) {
          grouped[item.nama] = { ...item };
        } else {
          grouped[item.nama].stok += item.stok;
        }
      });
      displayItems = Object.values(grouped);
    }

    const selectedItems: { item: StockItem; input: OutboundRowInput }[] = [];
    displayItems.forEach((item) => {
      const key = getStockItemKey(item, buId);
      const input = outboundInputs[key];
      if (input && input.checked) {
        selectedItems.push({ item, input });
      }
    });

    if (selectedItems.length === 0) {
      toast('Pilih minimal satu barang yang mau dikeluarkan', 'error');
      return;
    }

    // Validate selections
    for (const { item, input } of selectedItems) {
      const qtyVal = parseFloat(input.qty);
      if (isNaN(qtyVal) || qtyVal <= 0) {
        toast(`Quantity keluar untuk ${item.nama} harus lebih besar dari 0`, 'error');
        return;
      }
      if (qtyVal > item.stok) {
        toast(`Quantity keluar untuk ${item.nama} melebihi sisa stok akhir (${item.stok})`, 'error');
        return;
      }
    }

    const totalQty = selectedItems.reduce((sum, { input }) => sum + (parseFloat(input.qty) || 0), 0);

    if (totalQty >= 100 && !paktaConfirmed && !skipPaktaCheck) {
      setShowPakta(true);
      return;
    }

    const userData = JSON.parse(localStorage.getItem('wms_user') || '{}');
    const userEmail = userData.username || userData.email || 'unknown';

    // Build payload items
    const payloadItems = selectedItems.map(({ item, input }) => {
      return {
        nama: item.nama,
        qty: parseFloat(input.qty),
        uom: input.uom || item.uom,
        warna: item.warna || undefined,
        ukuran: item.ukuran || undefined,
        lebar: item.lebar || undefined,
        diskon: buId === 'atrione' ? parseFloat(input.diskon) || 0 : undefined,
        keterangan: input.keterangan || undefined,
        harga: item.harga_jual || 0,
        hpp: item.hpp || 0,
      };
    });

    const costVal = header.delivery_cost ? parseFloat(header.delivery_cost) : (header.delivery_costDisplay ? parseHargaID(header.delivery_costDisplay) : undefined);

    const result = await withLoading(
      () =>
        batchOutbound({
          bu,
          no_sj: header.no_sj,
          tanggal: header.tanggal,
          customer: header.customer,
          no_po: header.no_po || undefined,
          remarks: header.remarks || undefined,
          user: userEmail,
          items: payloadItems,
          payment_method: buId === 'atrione' ? header.payment_method || undefined : undefined,
          delivery_date: buId === 'atrione' ? header.delivery_date || undefined : undefined,
          resi: buId === 'atrione' ? header.resi || undefined : undefined,
          courier: buId === 'atrione' ? header.courier || undefined : undefined,
          delivery_cost: buId === 'atrione' ? costVal : undefined,
          pakta_confirmed: totalQty >= 100 ? true : undefined,
        }),
      {
        loadingText: 'Menyimpan transaksi keluar batch…',
      },
    );

    if (result) {
      if (result.ok) {
        toast(`Surat Jalan keluar disimpan. No SJ: ${header.no_sj}`, 'success');
      } else {
        toast(`Backend down — transaksi masuk antrian (id: ${result.queue_id})`, 'warning');
      }
      setTxModalType(null);
      loadRecent();

      // Reset
      setHeader({
        no_sj: `SJ-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`,
        tanggal: new Date().toISOString().slice(0, 10),
        customer: '',
        no_po: '',
        remarks: '',
        payment_method: '',
        delivery_date: '',
        resi: '',
        courier: '',
        delivery_costDisplay: '',
        delivery_cost: '',
      });
      setOutboundInputs({});
      setPaktaChecked(false);
      setPaktaConfirmed(false);
      setShowPakta(false);
      loadStock(); // reload stock checklist
    }
  }

  const flags = buConfig ? getBuFlags(buConfig) : null;
  const isAtrione = buConfig?.bu_id === 'atrione';
  const isCanvas = buConfig?.bu_id === 'canvas';
  const isChemical = buConfig?.bu_id === 'chemical';

  // Group display stock rows for Chemical consolidated, normal for others
  let displayStockItems = stockItems;
  if (isChemical) {
    const grouped: Record<string, StockItem> = {};
    stockItems.forEach((item) => {
      if (!grouped[item.nama]) {
        grouped[item.nama] = { ...item };
      } else {
        grouped[item.nama].stok += item.stok;
      }
    });
    displayStockItems = Object.values(grouped);
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-extrabold flex items-center gap-3">
          <Receipt size={32} weight="fill" className="text-primary" />
          Transaksi {bu}
        </h1>
        <div className="flex gap-3">
          <button type="button" onClick={() => setTxModalType('masuk')} className="btn btn-primary bg-success hover:bg-green-700 border-none">
            <ArrowDown size={18} weight="bold" /> Barang Masuk
          </button>
          <button type="button" onClick={() => setTxModalType('keluar')} className="btn btn-primary bg-danger hover:bg-red-700 border-none">
            <ArrowUp size={18} weight="bold" /> Barang Keluar
          </button>
        </div>
      </div>

      {(

        <div className="card">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
            <h3 className="card-title m-0 whitespace-nowrap">50 Transaksi Terakhir (30 hari)</h3>
            <div className="flex gap-2 w-full md:w-auto">
              <input 
                type="date" 
                className="form-control text-sm py-1.5" 
                value={filterListDate} 
                onChange={(e) => setFilterListDate(e.target.value)} 
                title="Filter Tanggal"
              />
              <input 
                type="text" 
                placeholder="Cari material..." 
                className="form-control text-sm py-1.5 w-full md:w-48"
                value={filterListSearch}
                onChange={(e) => setFilterListSearch(e.target.value)}
              />
              <button type="button" onClick={() => { setFilterListDate(''); setFilterListSearch(''); loadRecent(); }} className="btn btn-secondary whitespace-nowrap py-1.5">
                <ArrowsClockwise size={16} weight="bold" />
                Refresh
              </button>
            </div>
          </div>
          {loadingList ? (
            <div className="py-12 flex justify-center">
              <RadialLoading size={60} />
            </div>
          ) : recent.length === 0 ? (
            <p className="text-center text-muted py-12">Tidak ada transaksi 30 hari terakhir</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Tanggal</th>
                    <th>Nama</th>
                    <th>Variasi</th>
                    <th className="text-right">Masuk</th>
                    <th className="text-right">Keluar</th>
                    <th>Customer/Supplier</th>
                    <th>No SJ</th>
                    <th>Keterangan</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.filter(tx => {
                    if (filterListDate && tx.Tanggal && tx.Tanggal !== '') {
                      try {
                        const txDateStr = new Date(tx.Tanggal as string).toISOString().slice(0, 10);
                        if (txDateStr !== filterListDate) return false;
                      } catch(e) {}
                    }
                    if (filterListSearch) {
                      const searchStr = String(tx['Nama Material'] || tx['Nama Barang'] || '').toLowerCase();
                      if (!searchStr.includes(filterListSearch.toLowerCase())) return false;
                    }
                    return true;
                  }).map((tx, i) => (
                    <tr key={i}>
                      <td>{formatDateDmy(tx.Tanggal as string)}</td>
                      <td>{(tx['Nama Material'] || tx['Nama Barang'] || '-') as string}</td>
                      <td className="text-sm text-muted">
                        {[tx['Warna'], tx['Ukuran'], tx['Lebar']].filter(Boolean).join(' / ') || '-'}
                      </td>
                      <td className="text-right text-success">{(tx['Masuk'] as number) || ''}</td>
                      <td className="text-right text-danger">{(tx['Keluar'] as number) || ''}</td>
                      <td>{(tx['Customer/Supplier'] as string) || '-'}</td>
                      <td className="font-mono text-xs">{(tx['No SJ'] as string) || '-'}</td>
                      <td className="text-xs text-muted max-w-[150px] truncate" title={tx['Keterangan'] as string}>{(tx['Keterangan'] as string) || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {txModalType && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[8000] flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] rounded-2xl p-6 w-full max-w-6xl max-h-[90vh] overflow-y-auto shadow-xl relative">
            <button
              type="button"
              onClick={() => setTxModalType(null)}
              className="absolute top-4 right-4 text-muted hover:text-danger p-1"
            >
              <X size={24} weight="bold" />
            </button>
            <div className="mb-6 flex gap-4 border-b border-[var(--border)]">
              <button type="button" onClick={() => setTxModalType('masuk')} className={`px-4 py-2 font-semibold border-b-2 ${txModalType === 'masuk' ? 'border-success text-success' : 'border-transparent text-muted hover:text-success'}`}>Barang Masuk</button>
              <button type="button" onClick={() => setTxModalType('keluar')} className={`px-4 py-2 font-semibold border-b-2 ${txModalType === 'keluar' ? 'border-danger text-danger' : 'border-transparent text-muted hover:text-danger'}`}>Barang Keluar</button>
            </div>
            
            {txModalType === 'masuk' ? (
        // === BARANG MASUK TAB ===
        <form onSubmit={handleSubmitMasuk}>
          <h3 className="text-xl font-bold text-primary mb-4">Form Barang Masuk</h3>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="form-group">
              <label>Tanggal</label>
              <input
                type="date"
                className="form-control"
                value={form.tanggal}
                onChange={(e) => setForm({ ...form, tanggal: e.target.value })}
                required
              />
            </div>

            {/* Nama Barang Dropdown dari Master Data */}
            <div className="form-group">
              <label className="flex justify-between items-center">
                <span>Nama Barang</span>
                <button type="button" onClick={() => openModal(buConfig?.bu_id === 'atrione' ? 'Produk Baru' : 'Material Baru')} className="text-xs text-primary hover:underline">+ Tambah Baru</button>
              </label>
              {optionsLoading.material ? (
                <div className="form-control flex items-center"><RadialLoading size={16} /></div>
              ) : (
                <select
                  className="form-control"
                  value={form.nama}
                  onChange={(e) => setForm({ ...form, nama: e.target.value })}
                  required
                >
                  <option value="">-- Pilih Barang --</option>
                  {materialOptions.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Ukuran Dropdown (Atrione) */}
            {flags?.has_size && (
              <div className="form-group">
                <label>Ukuran</label>
                {optionsLoading.ukuran ? (
                  <div className="form-control flex items-center"><RadialLoading size={16} /></div>
                ) : ukuranOptions.length > 0 ? (
                  <select
                    className="form-control"
                    value={form.ukuran}
                    onChange={(e) => setForm({ ...form, ukuran: e.target.value })}
                  >
                    <option value="">-- Pilih Ukuran --</option>
                    {ukuranOptions.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    className="form-control"
                    value={form.ukuran}
                    onChange={(e) => setForm({ ...form, ukuran: e.target.value })}
                  />
                )}
              </div>
            )}

            {/* Warna Dropdown (Atrione cascading, other BUs normal dropdown) */}
            {flags?.has_color && (
              <div className="form-group">
                <label>Warna</label>
                {optionsLoading.warna ? (
                  <div className="form-control flex items-center"><RadialLoading size={16} /></div>
                ) : warnaOptions.length > 0 ? (
                  <select
                    className="form-control"
                    value={form.warna}
                    onChange={(e) => setForm({ ...form, warna: e.target.value })}
                  >
                    <option value="">-- Pilih Warna --</option>
                    {warnaOptions.map((w) => (
                      <option key={w} value={w}>{w}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    className="form-control"
                    value={form.warna}
                    onChange={(e) => setForm({ ...form, warna: e.target.value })}
                  />
                )}
              </div>
            )}

            {/* Lebar Dropdown (Canvas) */}
            {flags?.has_width && (
              <div className="form-group">
                <label>Lebar</label>
                {optionsLoading.lebar ? (
                  <div className="form-control flex items-center"><RadialLoading size={16} /></div>
                ) : lebarOptions.length > 0 ? (
                  <select
                    className="form-control"
                    value={form.lebar}
                    onChange={(e) => setForm({ ...form, lebar: e.target.value })}
                  >
                    <option value="">-- Pilih Lebar --</option>
                    {lebarOptions.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    className="form-control"
                    value={form.lebar}
                    onChange={(e) => setForm({ ...form, lebar: e.target.value })}
                  />
                )}
              </div>
            )}

            <div className="form-group">
              <label>UoM (Satuan)</label>
              <input
                type="text"
                className="form-control"
                value={form.uom}
                onChange={(e) => setForm({ ...form, uom: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label>Quantity</label>
              <input
                type="number"
                step="any"
                className="form-control"
                value={form.qty}
                onChange={(e) => setForm({ ...form, qty: e.target.value })}
                required
                min="0"
              />
            </div>

            {flags?.has_fifo && (
              <div className="form-group">
                <label>Harga Jual / Batch Value</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">Rp</span>
                  <input
                    type="number"
                    className="form-control"
                    value={form.harga}
                    onChange={(e) => setForm({ ...form, harga: e.target.value })}
                    required
                    min="0"
                    style={{ paddingLeft: '2.5rem' }}
                    placeholder="Wajib untuk FIFO"
                  />
                </div>
              </div>
            )}

            <div className="form-group">
              <label className="flex justify-between items-center">
                <span>Customer / Supplier</span>
                <button type="button" onClick={() => openModal('Customer Baru')} className="text-xs text-primary hover:underline">+ Tambah Baru</button>
              </label>
              {optionsLoading.customers ? (
                <div className="form-control flex items-center"><RadialLoading size={16} /></div>
              ) : (
                <select
                  className="form-control"
                  value={form.customer}
                  onChange={(e) => setForm({ ...form, customer: e.target.value })}
                >
                  <option value="">-- Pilih Customer/Supplier --</option>
                  {customerOptions.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              )}
            </div>

            <div className="form-group">
              <label>No Surat Jalan</label>
              <input
                type="text"
                className="form-control"
                value={form.no_sj}
                onChange={(e) => setForm({ ...form, no_sj: e.target.value })}
              />
            </div>

            <div className="form-group md:col-span-2">
              <label>Keterangan</label>
              <textarea
                className="form-control"
                rows={2}
                value={form.keterangan}
                onChange={(e) => setForm({ ...form, keterangan: e.target.value })}
              />
            </div>
          </div>

          <button type="submit" className="btn btn-primary mt-4">
            <Plus size={18} weight="bold" />
            Simpan Transaksi Masuk
          </button>
        </form>
      ) : (
        // === BARANG KELUAR TAB (CHECKLIST-BASED) ===
        <form onSubmit={handleSubmitKeluar} className="flex flex-col gap-6">
          {/* SJ Header Card */}
          <div className="card">
            <h3 className="card-title">Data Surat Jalan Keluar</h3>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="form-group">
                <label>Tanggal</label>
                <input
                  type="date"
                  className="form-control"
                  value={header.tanggal}
                  onChange={(e) => setHeader({ ...header, tanggal: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>No Surat Jalan</label>
                <input
                  type="text"
                  className="form-control font-mono"
                  value={header.no_sj}
                  onChange={(e) => setHeader({ ...header, no_sj: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="flex justify-between items-center">
                  <span>Customer</span>
                  <button type="button" onClick={() => openModal('Customer Baru')} className="text-xs text-primary hover:underline">+ Tambah Baru</button>
                </label>
                {optionsLoading.customers ? (
                  <div className="form-control flex items-center"><RadialLoading size={16} /></div>
                ) : (
                  <select
                    className="form-control"
                    value={header.customer}
                    onChange={(e) => setHeader({ ...header, customer: e.target.value })}
                    required
                  >
                    <option value="">-- Pilih Customer --</option>
                    {customerOptions.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                )}
              </div>

              <div className="form-group">
                <label>No PO</label>
                <input
                  type="text"
                  className="form-control"
                  value={header.no_po}
                  onChange={(e) => setHeader({ ...header, no_po: e.target.value })}
                />
              </div>

              <div className="form-group md:col-span-2">
                <label>Catatan / Remarks</label>
                <input
                  type="text"
                  className="form-control"
                  value={header.remarks}
                  onChange={(e) => setHeader({ ...header, remarks: e.target.value })}
                  placeholder="Keterangan SJ..."
                />
              </div>
            </div>

            {/* Atrione Conditional Delivery Fields */}
            {isAtrione && (
              <div className="border-t border-[var(--border)] pt-4 mt-4">
                <h4 className="text-sm font-bold text-primary mb-3">Detail Pengiriman (Khusus Atrione)</h4>
                <div className="grid md:grid-cols-5 gap-4">
                  <div className="form-group">
                    <label className="flex justify-between items-center">
                      <span>Metode Pembayaran</span>
                      <button type="button" onClick={() => openModal('Payment Method')} className="text-xs text-primary hover:underline">+ Tambah Baru</button>
                    </label>
                    {optionsLoading.payments ? (
                      <div className="form-control flex items-center"><RadialLoading size={16} /></div>
                    ) : (
                      <select
                        className="form-control"
                        value={header.payment_method}
                        onChange={(e) => setHeader({ ...header, payment_method: e.target.value })}
                      >
                        <option value="">-- Pilih Metode --</option>
                        {paymentOptions.map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className="form-group">
                    <label>Tanggal Pengiriman</label>
                    <input
                      type="date"
                      className="form-control"
                      value={header.delivery_date}
                      onChange={(e) => setHeader({ ...header, delivery_date: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>No Resi</label>
                    <input
                      type="text"
                      className="form-control"
                      value={header.resi}
                      onChange={(e) => setHeader({ ...header, resi: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Kurir</label>
                    <input
                      type="text"
                      className="form-control"
                      value={header.courier}
                      onChange={(e) => setHeader({ ...header, courier: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Ongkos Kirim</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">Rp</span>
                      <input
                        type="text"
                        className="form-control pl-8"
                        style={{ paddingLeft: '2rem' }}
                        value={header.delivery_costDisplay}
                        onChange={(e) => setHeader({ ...header, delivery_costDisplay: e.target.value })}
                        onBlur={() => {
                          const num = parseHargaID(header.delivery_costDisplay);
                          setHeader({ ...header, delivery_cost: String(num), delivery_costDisplay: formatHargaDisplay(num) });
                        }}
                        placeholder="0"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Stock Table Card */}
          <div className="card">
            <h3 className="card-title">Daftar Stok Aktif (Real-time)</h3>
            
            {loadingStock ? (
              <div className="py-12 flex justify-center">
                <RadialLoading size={60} />
              </div>
            ) : displayStockItems.length === 0 ? (
              <p className="text-center text-muted py-8">Tidak ada stok barang tersedia untuk dikeluarkan.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th style={{ width: '50px', textAlign: 'center' }}>Pilih</th>
                      <th>Nama Barang</th>
                      <th>Sisa Stok Akhir</th>
                      <th>Qty Keluar</th>
                      <th>UoM Keluar</th>
                      {isAtrione && <th>Diskon (%)</th>}
                      <th>Keterangan (Opsional)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayStockItems.map((item, idx) => {
                      const key = getStockItemKey(item, buConfig?.bu_id || '');
                      const input = outboundInputs[key] || {
                        checked: false,
                        qty: '',
                        uom: item.uom,
                        diskon: '0',
                        keterangan: '',
                      };

                      const variation = [
                        !isChemical && item.warna ? `Warna: ${item.warna}` : null,
                        item.ukuran ? `Size: ${item.ukuran}` : null,
                        item.lebar ? `Lebar: ${item.lebar}` : null,
                      ]
                        .filter(Boolean)
                        .join(', ');

                      const displayName = (
                        <div>
                          <strong>{item.nama}</strong>
                          {variation && <div className="text-xs text-muted font-normal mt-0.5">{variation}</div>}
                        </div>
                      );

                      const cleanUom = isAtrione && (item.uom.toLowerCase() === 'box' || item.uom.toLowerCase() === 'prs') ? 'prs' : item.uom;

                      return (
                        <tr key={key} className={input.checked ? 'bg-primary/5' : undefined}>
                          <td style={{ textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={input.checked}
                              onChange={(e) => handleOutboundCheckboxChange(key, e.target.checked)}
                              style={{ transform: 'scale(1.3)', cursor: 'pointer' }}
                            />
                          </td>
                          <td>{displayName}</td>
                          <td>
                            <span className="font-semibold">{item.stok.toLocaleString('id-ID')}</span>{' '}
                            <span className="text-xs text-muted">{cleanUom}</span>
                          </td>
                          <td>
                            <input
                              type="number"
                              className="form-control"
                              style={{ width: '100px' }}
                              value={input.qty}
                              onChange={(e) => handleOutboundInputChange(key, 'qty', e.target.value)}
                              placeholder="0"
                              disabled={!input.checked}
                              min="1"
                              max={item.stok}
                              required={input.checked}
                            />
                          </td>
                          <td>
                            {isCanvas ? (
                              <select
                                className="form-control"
                                style={{ width: '100px' }}
                                value={input.uom}
                                onChange={(e) => handleOutboundInputChange(key, 'uom', e.target.value)}
                                disabled={!input.checked}
                              >
                                <option value="Meter">Meter</option>
                                <option value="Yard">Yard</option>
                              </select>
                            ) : (
                              <span className="text-sm font-semibold">{cleanUom}</span>
                            )}
                          </td>
                          {isAtrione && (
                            <td>
                              <input
                                type="number"
                                className="form-control"
                                style={{ width: '80px' }}
                                value={input.diskon}
                                onChange={(e) => handleOutboundInputChange(key, 'diskon', e.target.value)}
                                disabled={!input.checked}
                                min="0"
                                max="100"
                              />
                            </td>
                          )}
                          <td>
                            <input
                              type="text"
                              className="form-control"
                              value={input.keterangan}
                              onChange={(e) => handleOutboundInputChange(key, 'keterangan', e.target.value)}
                              placeholder="Keterangan..."
                              disabled={!input.checked}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <button type="submit" className="btn btn-danger w-full md:w-auto px-8 py-3">
              <Plus size={20} weight="bold" />
              Simpan Pengiriman (Outbound)
            </button>
          </div>
        </form>
      )}
          </div>
        </div>
      )}

      {/* === UI-4: Modal Pakta Integritas === */}
      {showPakta && (
        <div className="loading-overlay">
          <div className="bg-[var(--surface)] p-6 rounded-2xl shadow-2xl border border-[var(--border)] max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4 text-warning">
              <Warning size={28} weight="fill" />
              <h3 className="text-lg font-bold text-[var(--text-main)]">Pakta Integritas</h3>
            </div>
            <p className="text-sm text-[var(--text-muted)] mb-6 leading-relaxed">
              Saya menyatakan bahwa jumlah barang yang dikeluarkan sudah sesuai dengan instruksi kerja dan data fisik di gudang. Segala manipulasi data akan ditindak sesuai aturan perusahaan.
            </p>
            
            <div className="flex items-start gap-3 mb-6 bg-[var(--bg-color)] p-4 rounded-lg border border-[var(--border)]">
              <input
                id="pakta-check"
                type="checkbox"
                checked={paktaChecked}
                onChange={(e) => setPaktaChecked(e.target.checked)}
                className="mt-1"
                style={{ transform: 'scale(1.2)' }}
              />
              <label htmlFor="pakta-check" className="text-xs font-medium text-[var(--text-main)] cursor-pointer select-none">
                Saya menyetujui pakta integritas ini secara sadar.
              </label>
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowPakta(false);
                  setPaktaChecked(false);
                }}
              >
                Batal
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!paktaChecked}
                onClick={() => {
                  setPaktaConfirmed(true);
                  setShowPakta(false);
                  setTimeout(() => {
                    handleSubmitKeluar(undefined, true);
                  }, 100);
                }}
              >
                Ya, Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* === Master Data Modal === */}
      <ModalMasterData
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        buName={bu}
        defaultType={modalType}
        onSuccess={handleModalSuccess}
      />
    </div>
  );
}

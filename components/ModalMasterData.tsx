'use client';

import { useState } from 'react';
import { X } from '@phosphor-icons/react';
import { saveMasterData } from '@/lib/master-data';
import { alertError, alertSuccess, withLoading } from '@/lib/swal';

interface ModalMasterDataProps {
  isOpen: boolean;
  onClose: () => void;
  buName: string;
  defaultType: string;
  onSuccess: (newName: string) => void;
}

export default function ModalMasterData({ isOpen, onClose, buName, defaultType, onSuccess }: ModalMasterDataProps) {
  const [nama, setNama] = useState('');
  
  // Specific fields for Produk/Material
  const [ukuran, setUkuran] = useState('');
  const [warna, setWarna] = useState('');
  const [lebar, setLebar] = useState('');

  if (!isOpen) return null;

  const isProduct = defaultType === 'Produk Baru' || defaultType === 'Material Baru';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nama) return;

    try {
      const payload: any = {
        bu: buName,
        tipe: defaultType,
        Nama: nama,
      };

      if (isProduct) {
        if (ukuran) payload['Ukuran'] = ukuran;
        if (warna) payload['Warna'] = warna;
        if (lebar) payload['Lebar'] = lebar;
      }

      await withLoading(
        () => saveMasterData(payload),
        { loadingText: 'Menyimpan Master Data...' }
      );

      alertSuccess('Berhasil disimpan!');
      onSuccess(nama);
      onClose();
      setNama('');
      setUkuran('');
      setWarna('');
      setLebar('');
    } catch (err) {
      alertError(err);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex justify-between items-center p-4 border-b border-[var(--border)] bg-gray-50">
          <h3 className="font-bold text-lg text-primary">Tambah {defaultType}</h3>
          <button type="button" onClick={onClose} className="text-muted hover:text-danger transition">
            <X size={24} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          <div className="form-group">
            <label>Nama {defaultType.split(' ')[0]}</label>
            <input
              type="text"
              className="form-control"
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              required
              autoFocus
            />
          </div>

          {isProduct && (
            <>
              <div className="form-group">
                <label>Ukuran (Opsional)</label>
                <input
                  type="text"
                  className="form-control"
                  value={ukuran}
                  onChange={(e) => setUkuran(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Warna (Opsional)</label>
                <input
                  type="text"
                  className="form-control"
                  value={warna}
                  onChange={(e) => setWarna(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Lebar (Opsional)</label>
                <input
                  type="text"
                  className="form-control"
                  value={lebar}
                  onChange={(e) => setLebar(e.target.value)}
                />
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={onClose} className="btn border border-gray-300 text-gray-700 bg-white hover:bg-gray-50">
              Batal
            </button>
            <button type="submit" className="btn btn-primary">
              Simpan
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

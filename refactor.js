const fs = require('fs');
const path = './app/(authenticated)/transaction/page.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add X import
content = content.replace(
  "import { Receipt, Plus, ArrowsClockwise, ArrowDown, ArrowUp, ListBullets, Warning } from '@phosphor-icons/react';",
  "import { Receipt, Plus, ArrowsClockwise, ArrowDown, ArrowUp, ListBullets, Warning, X } from '@phosphor-icons/react';"
);

// 2. Change activeTab to txModalType
content = content.replace(
  "const [activeTab, setActiveTab] = useState<Tab>('masuk');",
  "const [txModalType, setTxModalType] = useState<'masuk' | 'keluar' | null>(null);"
);

// 3. Remove Tab type
content = content.replace("type Tab = 'masuk' | 'keluar' | 'list';\n", "");

// 4. Update header and buttons
content = content.replace(
  /<\/h1>\s*<\/div>\s*\{\/\* Sub-tabs \*\/\}.*?\{activeTab === 'list' \? \(/s,
  `</h1>
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
`
);

// 5. Wrap forms in modal
content = content.replace(
  /\) : activeTab === 'masuk' \? \(/,
  `)}

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
              <button type="button" onClick={() => setTxModalType('masuk')} className={\`px-4 py-2 font-semibold border-b-2 \${txModalType === 'masuk' ? 'border-success text-success' : 'border-transparent text-muted hover:text-success'}\`}>Barang Masuk</button>
              <button type="button" onClick={() => setTxModalType('keluar')} className={\`px-4 py-2 font-semibold border-b-2 \${txModalType === 'keluar' ? 'border-danger text-danger' : 'border-transparent text-muted hover:text-danger'}\`}>Barang Keluar</button>
            </div>
            
            {txModalType === 'masuk' ? (`
);

// 6. Close Modal before Pakta Modal
content = content.replace(
  /      \)\}\s*\{\/\* === UI-4: Modal Pakta Integritas === \*\/\}/s,
  `      )}
            )}
          </div>
        </div>
      )}

      {/* === UI-4: Modal Pakta Integritas === */}`
);

// 7. Add setTxModalType(null) and loadRecent() on success for Masuk
content = content.replace(
  /toast\(\`Transaksi masuk disimpan\. No SJ: \$\{form\.no_sj\}\`, 'success'\);\s*\} else \{\s*toast\(\`Backend down — transaksi masuk antrian \(id: \$\{result\.queue_id\}\)\`, 'warning'\);\s*\}/,
  `toast(\`Transaksi masuk disimpan. No SJ: \$\{form.no_sj\}\`, 'success');
      } else {
        toast(\`Backend down — transaksi masuk antrian (id: \$\{result.queue_id\})\`, 'warning');
      }
      setTxModalType(null);
      loadRecent();`
);

// 8. Add setTxModalType(null) and loadRecent() on success for Keluar
content = content.replace(
  /toast\(\`Surat Jalan keluar disimpan\. No SJ: \$\{header\.no_sj\}\`, 'success'\);\s*\} else \{\s*toast\(\`Backend down — transaksi masuk antrian \(id: \$\{result\.queue_id\}\)\`, 'warning'\);\s*\}/,
  `toast(\`Surat Jalan keluar disimpan. No SJ: \$\{header.no_sj\}\`, 'success');
      } else {
        toast(\`Backend down — transaksi masuk antrian (id: \$\{result.queue_id\})\`, 'warning');
      }
      setTxModalType(null);
      loadRecent();`
);

// 9. Fix useEffect checking activeTab === 'keluar'
content = content.replace(
  "if (bu && activeTab === 'keluar') {",
  "if (bu && txModalType === 'keluar') {"
);

content = content.replace(
  "}, [bu, activeTab, loadStock]);",
  "}, [bu, txModalType, loadStock]);"
);

fs.writeFileSync(path, content, 'utf8');
console.log('Done refactoring');

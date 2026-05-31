/**
 * BU Registry types — MASTER_SPEC §1.2
 * Semua BU di-define di sheet BU_Registry, dibaca runtime via lib/bu-registry.ts.
 */

export type BUType = 'fabric' | 'chemical' | 'product' | 'general';

export type SuratJalanTemplate = 'canvas' | 'chemical' | 'default';

export interface BUConfig {
  /** Lowercase, snake_case, immutable setelah dibuat (ADR-08) */
  bu_id: string;
  bu_name: string;
  bu_type: BUType;
  /** Emoji icon, max 5 chars */
  icon: string;
  default_uom: string;
  low_stock_threshold: number;

  /** Feature flags — menentukan field apa yang muncul di form & schema */
  has_color: boolean;
  has_width: boolean;
  has_size: boolean;
  has_weight: boolean;
  has_hpp: boolean;
  has_discount: boolean;
  has_fifo: boolean;
  has_delivery_fields: boolean;

  surat_jalan_template: SuratJalanTemplate;
  /** JSON array, min 1 element. e.g. ["Meter", "Yard"] */
  uom_options: string[];
  /** JSON array, min 1 element. e.g. ["IDR", "USD"] */
  currency_options: string[];

  is_active: boolean;
  sort_order: number;

  /** Drive file ID untuk logo BU (Surat Jalan header). Empty string = no logo. */
  logo_file_id: string;
}

export type Role = 'Admin' | 'User' | 'Superadmin';

export interface UserAccount {
  email: string;
  /** PBKDF2 (Apps Script) atau bcrypt (Vercel) hash */
  password_hash: string;
  salt: string;
  iterations: number;
  role: Role;
  username: string;
  failed_attempts: number;
  /** ISO timestamp, null jika tidak locked */
  locked_until: string | null;
  /** ISO timestamp — untuk session invalidation */
  password_changed_at: string;
  is_active: boolean;
}

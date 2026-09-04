export type BalanceAccountType = 'credit_card' | 'debit' | 'bank_account' | 'other';

/**
 * Captura de saldo de una app bancaria/tarjeta. NO es una transacción: no tiene
 * type ingreso/egreso ni entra al dashboard. La crea el pipeline de upload de
 * tickets cuando clasifica la imagen como pantalla de saldo.
 */
export interface BackendBalance {
  _id: string;
  bank: string | null;
  accountType: BalanceAccountType;
  accountRef: string | null;
  /** Lo que se debe en tarjeta ("Saldo utilizado"/"Saldo a la fecha") o el saldo de la cuenta. */
  currentBalance: number | null;
  /** Solo tarjeta: "Crédito disponible". */
  availableCredit: number | null;
  /** Solo tarjeta: "Línea de crédito". */
  creditLimit: number | null;
  currency: string;
  /** Momento que refleja el saldo (fecha mostrada o de subida). */
  capturedAt: string;
  imageUrl?: string;
  created_at: string;
  updated_at: string;
}

export interface BalancesListParams {
  bank?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

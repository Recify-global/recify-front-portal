export type BackendTicketType = 'ingreso' | 'egreso';
export type BackendPaymentMethod = 'card' | 'cash' | 'transfer' | 'other';
export type BackendTicketStatus = 'pending' | 'processed' | 'failed' | 'duplicate';
export type BackendTicketReviewStatus = 'pendiente' | 'revisado';

export interface BackendTicketRawData {
  vendor?: string | null;
  vendorRFC?: string | null;
  folio?: string | null;
  subtotal?: number | null;
  tax?: number | null;
  ocrText?: string;
  imageUrl?: string;
  confidence?: number;
  [key: string]: unknown;
}

export interface BackendTicket {
  _id: string;
  companyId: string;
  /** Proyectado por daily-report; GET /tickets todavía no lo entrega. */
  imageUrl?: string | null;
  /**
   * GET /tickets (findAll/findById) lo backfillea desde rawData.vendor y
   * garantiza la clave (null si no hay comercio). rawData ya no viene ahí.
   */
  vendor?: string | null;
  type: BackendTicketType;
  date: string;
  amount: number;
  category?: string;
  paymentMethod: BackendPaymentMethod;
  status: BackendTicketStatus;
  reviewStatus?: BackendTicketReviewStatus;
  rawData?: BackendTicketRawData;
  created_at: string;
  updated_at: string;
}

export interface TicketsListParams {
  type?: BackendTicketType;
  status?: BackendTicketStatus;
  reviewStatus?: BackendTicketReviewStatus;
  paymentMethod?: BackendPaymentMethod;
  sourceId?: string;
  category?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

export interface TicketUpdatePayload {
  status?: BackendTicketStatus;
  reviewStatus?: BackendTicketReviewStatus;
  category?: string;
  paymentMethod?: BackendPaymentMethod;
}

export type UiTicketStatus = 'analizado' | 'pendiente' | 'error';

export interface UiTicket {
  id: string;
  comercio: string;
  folio?: string;
  fecha: string;
  hora: string;
  subtotal: number;
  iva: number;
  total: number;
  moneda: string;
  categoria: string;
  tipo: string;
  metodoPago: string;
  estatus: UiTicketStatus;
  reviewStatus: string;
  notas: string;
  imagenUrl?: string;
}

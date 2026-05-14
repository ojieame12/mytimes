export type CheckoutReturnProduct = 'event_pass' | 'company_standby' | 'cancelled';

export type CheckoutReturn = {
  product: CheckoutReturnProduct;
  sessionId?: string;
};

const CHECKOUT_PRODUCTS: CheckoutReturnProduct[] = [
  'event_pass',
  'company_standby',
  'cancelled',
];

export function readCheckoutReturn(search = window.location.search): CheckoutReturn | undefined {
  const params = new URLSearchParams(search);
  const product = params.get('checkout');
  if (!isCheckoutProduct(product)) return undefined;

  const sessionId = params.get('session_id') ?? undefined;
  return { product, sessionId };
}

export function clearCheckoutReturnParams() {
  const url = new URL(window.location.href);
  url.searchParams.delete('checkout');
  url.searchParams.delete('session_id');
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

function isCheckoutProduct(value: string | null): value is CheckoutReturnProduct {
  return value !== null && CHECKOUT_PRODUCTS.includes(value as CheckoutReturnProduct);
}

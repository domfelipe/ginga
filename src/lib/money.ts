const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/** Money is stored as integer cents; format for display as USD. */
export function formatUSD(cents: number): string {
  return usd.format(cents / 100);
}

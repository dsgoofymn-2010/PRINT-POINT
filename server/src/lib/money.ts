const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });

export const formatINR = (paise: number) => inr.format(paise / 100);
export const rupeesToPaise = (rupees: number) => Math.round(rupees * 100);

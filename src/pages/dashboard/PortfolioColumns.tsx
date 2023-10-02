import { ColumnDef } from '@tanstack/table-core';
import { getIcon } from './PortfolioIcons';

export interface PortfolioAsset {
  token: string;
  price: number;
  amount: number;
  usdValue?: number;
}

export const tokenColumn: ColumnDef<PortfolioAsset> = {
  header: 'Token',
  accessorKey: 'token',
  enableMultiSort: true,
  cell: ({ row }) => {
    return (
      <div className="flex flex-row">
        <img
          src={getIcon(row.original.token)}
          className="mr-2"
          style={{
            objectFit: 'cover',
            width: '32px',
            height: '32px',
          }}
        />
        <div className="leading-8"> {row.original.token} </div>
      </div>
    );
  },
};

export const priceColumn: ColumnDef<PortfolioAsset> = {
  header: 'Price',
  accessorKey: 'price',
  enableMultiSort: true,
  cell: ({ row }) => {
    return (
      <div title={row.original.price ? row.original.price.toString() : undefined}>
        {row.original.price ? '$ ' + row.original.price.toFixed(4) : '-'}
      </div>
    );
  },
};

export const amountColumn: ColumnDef<PortfolioAsset> = {
  header: 'Amount',
  accessorKey: 'amount',
  enableMultiSort: true,
  cell: ({ row }) => {
    return <div title={row.original.amount.toString()}>{row.original.amount.toFixed(3)}</div>;
  },
};

export const usdValueColumn: ColumnDef<PortfolioAsset> = {
  header: 'USD Value',
  accessorKey: 'usdValue',
  enableMultiSort: true,
  accessorFn: ({ price, amount }) => (price ? '$ ' + (price * amount).toFixed(2) : '-'),
  cell: ({ row }) => {
    const { price, amount } = row.original;
    return (
      <div title={price ? (price * amount).toString() : '-'}>{price ? '$ ' + (price * amount).toFixed(2) : '-'}</div>
    );
  },
};

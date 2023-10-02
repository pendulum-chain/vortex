import { render, screen } from '@testing-library/preact';
import Pagination from '.';

describe('Pagination', () => {
  test('should display correct pagination', () => {
    const props = {
      currentIndex: 0,
      pageSize: 10,
      totalCount: 35,
      pageCount: 4,
      onPrev: () => undefined,
      onNext: () => undefined,
    };
    render(<Pagination {...props} />);
    expect(screen.getByText('1 - 10 of 35')).toBeInTheDocument();
  });

  test('should display correct pagination with 0 items', () => {
    const props = {
      currentIndex: 0,
      pageSize: 10,
      totalCount: 0,
      pageCount: 0,
      onPrev: () => undefined,
      onNext: () => undefined,
    };
    render(<Pagination {...props} />);
    expect(screen.getByText('1 - 0 of 0')).toBeInTheDocument();
  });

  test('should display correct pagination without pageCount', () => {
    const props = {
      currentIndex: 0,
      pageSize: 10,
      totalCount: 35,
      onPrev: () => undefined,
      onNext: () => undefined,
    };
    render(<Pagination {...props} />);
    expect(screen.getByText('1 - 10 of 35')).toBeInTheDocument();
  });
});

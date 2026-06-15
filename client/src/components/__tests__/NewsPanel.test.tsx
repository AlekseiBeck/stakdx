import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import NewsPanel from '../NewsPanel';
import type { NewsItem } from '../../types';

const item = (over: Partial<NewsItem> = {}): NewsItem => ({
  id: '1', headline: 'NVDA pops on earnings', source: 'Reuters', url: 'https://r.com/1',
  createdAt: new Date().toISOString(), symbols: ['NVDA'], summary: '', ...over,
});

const props = (over: Partial<React.ComponentProps<typeof NewsPanel>> = {}) => ({
  news: [], onSearch: vi.fn(), onClear: vi.fn(), activeQuery: '', isSearching: false, ...over,
});

describe('NewsPanel', () => {
  it('shows the Market News header and story count by default', () => {
    render(<NewsPanel {...props({ news: [item(), item({ id: '2' })] })} />);
    expect(screen.getByText('Market News')).toBeInTheDocument();
    expect(screen.getByText('2 stories')).toBeInTheDocument();
  });

  it('renders headlines and sources', () => {
    render(<NewsPanel {...props({ news: [item({ headline: 'Big move', source: 'WSJ' })] })} />);
    expect(screen.getByText('Big move')).toBeInTheDocument();
    expect(screen.getByText('WSJ')).toBeInTheDocument();
  });

  it('submitting the search box calls onSearch with the trimmed query', () => {
    const onSearch = vi.fn();
    const { container } = render(<NewsPanel {...props({ onSearch })} />);
    fireEvent.change(screen.getByPlaceholderText(/Search news/i), { target: { value: '  memory  ' } });
    fireEvent.submit(container.querySelector('form')!);
    expect(onSearch).toHaveBeenCalledWith('memory');
  });

  it('switches to the News Search header and shows the Covering focus line', () => {
    render(<NewsPanel {...props({ activeQuery: 'memory', focus: 'MU, Samsung, DRAM' })} />);
    expect(screen.getByText('News Search')).toBeInTheDocument();
    expect(screen.getByText('Covering:')).toBeInTheDocument();
    expect(screen.getByText(/MU, Samsung, DRAM/)).toBeInTheDocument();
  });

  it('does not render the Covering line without a focus value', () => {
    render(<NewsPanel {...props({ activeQuery: 'memory' })} />);
    expect(screen.queryByText('Covering:')).not.toBeInTheDocument();
  });

  it('clicking Clear in the banner calls onClear', () => {
    const onClear = vi.fn();
    render(<NewsPanel {...props({ activeQuery: 'memory', onClear })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onClear).toHaveBeenCalled();
  });

  it('shows a searching state', () => {
    render(<NewsPanel {...props({ isSearching: true })} />);
    expect(screen.getByText('Searching…')).toBeInTheDocument();
  });

  it('shows an empty-results message for an active query', () => {
    render(<NewsPanel {...props({ activeQuery: 'zzz', news: [] })} />);
    expect(screen.getByText('No news found for "zzz"')).toBeInTheDocument();
  });
});

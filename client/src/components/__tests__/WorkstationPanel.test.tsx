import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Stub the chart (lightweight-charts can't render in jsdom) and the link-preview API.
vi.mock('../StockChart', () => ({ default: ({ ticker }: { ticker: string }) => <div data-testid="chart">{ticker}</div> }));
const { fetchLinkPreview } = vi.hoisted(() => ({ fetchLinkPreview: vi.fn() }));
vi.mock('../../api', () => ({ fetchLinkPreview }));

import WorkstationPanel from '../WorkstationPanel';

const props = (over: Partial<React.ComponentProps<typeof WorkstationPanel>> = {}) => ({
  tickers: [], onAddTicker: vi.fn(), onRemoveTicker: vi.fn(),
  articles: [], onAddArticle: vi.fn(), onRemoveArticle: vi.fn(), ...over,
});

beforeEach(() => fetchLinkPreview.mockReset().mockResolvedValue({ title: 'Resolved Title', source: 'reuters.com' }));

describe('WorkstationPanel — tickers', () => {
  it('shows the empty state with no tickers loaded', () => {
    render(<WorkstationPanel {...props()} />);
    expect(screen.getByText('No charts loaded yet.')).toBeInTheDocument();
  });

  it('renders a chart tile per loaded ticker', () => {
    render(<WorkstationPanel {...props({ tickers: ['AMD', 'NVDA'] })} />);
    expect(screen.getAllByTestId('chart').map((n) => n.textContent)).toEqual(['AMD', 'NVDA']);
    expect(screen.getByText('2 loaded')).toBeInTheDocument();
  });

  it('adds a ticker (uppercased, sanitized) on submit', () => {
    const onAddTicker = vi.fn();
    render(<WorkstationPanel {...props({ onAddTicker })} />);
    const input = screen.getByPlaceholderText('Add ticker');
    fireEvent.change(input, { target: { value: 'amd' } });
    fireEvent.submit(input.closest('form')!);
    expect(onAddTicker).toHaveBeenCalledWith('AMD');
  });

  it('removes a ticker via its remove button', () => {
    const onRemoveTicker = vi.fn();
    render(<WorkstationPanel {...props({ tickers: ['AMD'], onRemoveTicker })} />);
    fireEvent.click(screen.getByTitle('Remove AMD'));
    expect(onRemoveTicker).toHaveBeenCalledWith('AMD');
  });
});

describe('WorkstationPanel — articles tray', () => {
  it('is collapsed until the Articles header is clicked', () => {
    render(<WorkstationPanel {...props()} />);
    expect(screen.queryByPlaceholderText(/Paste an article link/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Articles/i }));
    expect(screen.getByPlaceholderText(/Paste an article link/i)).toBeInTheDocument();
  });

  it('resolves a pasted link and calls onAddArticle', async () => {
    const onAddArticle = vi.fn();
    render(<WorkstationPanel {...props({ onAddArticle })} />);
    fireEvent.click(screen.getByRole('button', { name: /Articles/i }));
    const input = screen.getByPlaceholderText(/Paste an article link/i);
    fireEvent.change(input, { target: { value: 'https://reuters.com/x' } });
    fireEvent.submit(input.closest('form')!);

    expect(fetchLinkPreview).toHaveBeenCalledWith('https://reuters.com/x');
    await waitFor(() => expect(onAddArticle).toHaveBeenCalled());
    expect(onAddArticle.mock.calls[0][0]).toMatchObject({ url: 'https://reuters.com/x', title: 'Resolved Title', source: 'reuters.com' });
  });

  it('prepends https:// to a bare host before resolving', async () => {
    render(<WorkstationPanel {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: /Articles/i }));
    const input = screen.getByPlaceholderText(/Paste an article link/i);
    fireEvent.change(input, { target: { value: 'example.com/a' } });
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => expect(fetchLinkPreview).toHaveBeenCalledWith('https://example.com/a'));
  });

  it('lists saved articles and removes one on click', () => {
    const onRemoveArticle = vi.fn();
    render(<WorkstationPanel {...props({
      articles: [{ url: 'https://a.com', title: 'Saved One', source: 'a.com' }],
      onRemoveArticle,
    })} />);
    fireEvent.click(screen.getByRole('button', { name: /Articles/i }));
    expect(screen.getByText('Saved One')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Remove article'));
    expect(onRemoveArticle).toHaveBeenCalledWith('https://a.com');
  });
});

// Dashboard Component Tests
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Dashboard from '../../client/src/pages/dashboard';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock recharts to avoid rendering issues in tests
vi.mock('recharts', () => ({
  BarChart: () => <div>BarChart</div>,
  Bar: () => <div>Bar</div>,
  XAxis: () => <div>XAxis</div>,
  YAxis: () => <div>YAxis</div>,
  CartesianGrid: () => <div>CartesianGrid</div>,
  Tooltip: () => <div>Tooltip</div>,
  Legend: () => <div>Legend</div>,
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  PieChart: () => <div>PieChart</div>,
  Pie: () => <div>Pie</div>,
  Cell: () => <div>Cell</div>,
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });
  
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock API responses
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/stats')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            totalFiles: 64,
            processedFiles: 62,
            processingFiles: 2,
            errorFiles: 0,
            totalSize: 104857600
          })
        });
      }
      
      if (url.includes('/api/files')) {
        return Promise.resolve({
          ok: true,
          json: async () => ([
            {
              id: '1',
              originalName: 'document.pdf',
              mimeType: 'application/pdf',
              size: 1024000,
              uploadDate: new Date().toISOString()
            },
            {
              id: '2',
              originalName: 'video.mp4',
              mimeType: 'video/mp4',
              size: 5242880,
              uploadDate: new Date().toISOString()
            }
          ])
        });
      }
      
      if (url.includes('/api/categories')) {
        return Promise.resolve({
          ok: true,
          json: async () => ([
            { category: 'Education', count: 30 },
            { category: 'Business', count: 20 },
            { category: 'Technology', count: 14 }
          ])
        });
      }
      
      return Promise.reject(new Error('Unknown endpoint'));
    });
  });

  it('should render dashboard overview', async () => {
    const wrapper = createWrapper();
    render(<Dashboard />, { wrapper });

    expect(screen.getByText('Dashboard Overview')).toBeInTheDocument();
    expect(screen.getByText(/Comprehensive insights/i)).toBeInTheDocument();
  });

  it('should display file statistics', async () => {
    const wrapper = createWrapper();
    render(<Dashboard />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText('Total Files')).toBeInTheDocument();
      expect(screen.getByText('64')).toBeInTheDocument();
      expect(screen.getByText('62')).toBeInTheDocument(); // Processed files
    });
  });

  it('should show storage usage', async () => {
    const wrapper = createWrapper();
    render(<Dashboard />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText(/Storage Used/i)).toBeInTheDocument();
      expect(screen.getByText(/100.0 MB/i)).toBeInTheDocument();
    });
  });

  it('should display recent files', async () => {
    const wrapper = createWrapper();
    render(<Dashboard />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText('Recent Files')).toBeInTheDocument();
      expect(screen.getByText('document.pdf')).toBeInTheDocument();
      expect(screen.getByText('video.mp4')).toBeInTheDocument();
    });
  });

  it('should show file categories', async () => {
    const wrapper = createWrapper();
    render(<Dashboard />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText('File Categories')).toBeInTheDocument();
      expect(screen.getByText('Education')).toBeInTheDocument();
      expect(screen.getByText('Business')).toBeInTheDocument();
      expect(screen.getByText('Technology')).toBeInTheDocument();
    });
  });

  it('should handle loading state', () => {
    const wrapper = createWrapper();
    render(<Dashboard />, { wrapper });

    // Should show skeleton loaders initially
    expect(screen.getAllByText(/Loading.../i).length).toBeGreaterThan(0);
  });

  it('should handle API errors gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('API Error'));

    const wrapper = createWrapper();
    render(<Dashboard />, { wrapper });

    await waitFor(() => {
      // Should still render the dashboard structure
      expect(screen.getByText('Dashboard Overview')).toBeInTheDocument();
    });
  });
});
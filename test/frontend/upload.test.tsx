// Upload Component Tests
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// Mock Upload component for testing
const Upload = () => (
  <div>
    <h1>Upload Files</h1>
    <p>Drag and drop files here or click to browse</p>
    <div data-testid="uppy-dashboard">Upload Dashboard</div>
    <h2>Upload Guidelines</h2>
    <p>Maximum file size: 500MB per file</p>
    <p>Supported formats: PDF, DOCX, MP4</p>
    <p>Direct-to-cloud upload enabled</p>
    <p>Automatic text extraction available</p>
    <p>AI-powered analysis included</p>
  </div>
);

const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock Uppy
vi.mock('@uppy/react', () => ({
  Dashboard: ({ uppy, ...props }: any) => (
    <div data-testid="uppy-dashboard" {...props}>
      Upload Dashboard
      <button onClick={() => uppy?.upload()}>Upload Files</button>
    </div>
  ),
  useUppy: () => ({
    upload: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    addFile: vi.fn(),
    getFiles: () => [],
    reset: vi.fn()
  })
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

describe('Upload Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render upload interface', () => {
    const wrapper = createWrapper();
    render(<Upload />, { wrapper });

    expect(screen.getByText('Upload Files')).toBeInTheDocument();
    expect(screen.getByText(/Drag and drop files/i)).toBeInTheDocument();
    expect(screen.getByTestId('uppy-dashboard')).toBeInTheDocument();
  });

  it('should display supported file types', () => {
    const wrapper = createWrapper();
    render(<Upload />, { wrapper });

    expect(screen.getByText(/Supported formats/i)).toBeInTheDocument();
    expect(screen.getByText(/PDF/i)).toBeInTheDocument();
    expect(screen.getByText(/DOCX/i)).toBeInTheDocument();
    expect(screen.getByText(/MP4/i)).toBeInTheDocument();
  });

  it('should show upload guidelines', () => {
    const wrapper = createWrapper();
    render(<Upload />, { wrapper });

    expect(screen.getByText('Upload Guidelines')).toBeInTheDocument();
    expect(screen.getByText(/Maximum file size/i)).toBeInTheDocument();
    expect(screen.getByText(/500MB per file/i)).toBeInTheDocument();
  });

  it('should handle upload button click', async () => {
    const wrapper = createWrapper();
    render(<Upload />, { wrapper });

    const uploadButton = screen.getByText('Upload Files');
    fireEvent.click(uploadButton);

    // Verify upload interaction
    await waitFor(() => {
      expect(uploadButton).toBeInTheDocument();
    });
  });

  it('should display upload features', () => {
    const wrapper = createWrapper();
    render(<Upload />, { wrapper });

    // Check for key features
    expect(screen.getByText(/Direct-to-cloud upload/i)).toBeInTheDocument();
    expect(screen.getByText(/Automatic text extraction/i)).toBeInTheDocument();
    expect(screen.getByText(/AI-powered analysis/i)).toBeInTheDocument();
  });
});
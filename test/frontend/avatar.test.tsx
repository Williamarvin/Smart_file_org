// Avatar Component Tests
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AvatarPage from '../../client/src/pages/avatar';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Test wrapper with QueryClient
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

describe('AvatarPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockClear();
  });

  it('should render avatar selection and chat interface', () => {
    const wrapper = createWrapper();
    render(<AvatarPage />, { wrapper });

    // Check if avatar selection is rendered
    expect(screen.getByText('AI Avatars')).toBeInTheDocument();
    expect(screen.getByText('Sage')).toBeInTheDocument();
    expect(screen.getByText('Spark')).toBeInTheDocument();
    expect(screen.getByText('Zen')).toBeInTheDocument();
    expect(screen.getByText('Bolt')).toBeInTheDocument();
  });

  it('should display selected avatar details', () => {
    const wrapper = createWrapper();
    render(<AvatarPage />, { wrapper });

    // Default avatar should be Sage
    expect(screen.getByText('Wise and knowledgeable mentor')).toBeInTheDocument();
  });

  it('should switch avatars when clicked', async () => {
    const wrapper = createWrapper();
    render(<AvatarPage />, { wrapper });

    // Click on Spark avatar
    const sparkCard = screen.getByText('Spark').closest('.cursor-pointer');
    if (sparkCard) {
      fireEvent.click(sparkCard);
    }

    // Check if Spark is selected
    await waitFor(() => {
      expect(screen.getByText('Creative and energetic companion')).toBeInTheDocument();
    });
  });

  it('should send chat message', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        response: 'Hello! How can I help you today?',
        audioData: 'base64audiodata',
        conversationContext: {}
      })
    });

    const wrapper = createWrapper();
    render(<AvatarPage />, { wrapper });

    // Type a message
    const input = screen.getByPlaceholderText(/type a message/i);
    await userEvent.type(input, 'Hello AI');

    // Send the message
    const sendButton = screen.getByRole('button', { name: /send/i });
    fireEvent.click(sendButton);

    // Check if API was called
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/avatar-chat',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('Hello AI')
        })
      );
    });
  });

  it('should toggle voice controls', async () => {
    const wrapper = createWrapper();
    render(<AvatarPage />, { wrapper });

    // Find voice toggle button
    const voiceToggle = screen.getByText(/Voice On/i).closest('button');
    
    if (voiceToggle) {
      fireEvent.click(voiceToggle);
      
      await waitFor(() => {
        expect(screen.getByText(/Voice Off/i)).toBeInTheDocument();
      });
    }
  });

  it('should handle chat error gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const wrapper = createWrapper();
    render(<AvatarPage />, { wrapper });

    // Type and send a message
    const input = screen.getByPlaceholderText(/type a message/i);
    await userEvent.type(input, 'Test message');
    
    const sendButton = screen.getByRole('button', { name: /send/i });
    fireEvent.click(sendButton);

    // Check for error handling
    await waitFor(() => {
      expect(screen.getByText(/having trouble connecting/i)).toBeInTheDocument();
    });
  });

  it('should display loading state while sending message', async () => {
    // Mock a delayed response
    mockFetch.mockImplementationOnce(() => 
      new Promise(resolve => setTimeout(() => resolve({
        ok: true,
        json: async () => ({ response: 'Test response' })
      }), 100))
    );

    const wrapper = createWrapper();
    render(<AvatarPage />, { wrapper });

    // Send a message
    const input = screen.getByPlaceholderText(/type a message/i);
    await userEvent.type(input, 'Test');
    
    const sendButton = screen.getByRole('button', { name: /send/i });
    fireEvent.click(sendButton);

    // Check for loading indicator
    await waitFor(() => {
      expect(screen.getByText(/is thinking/i)).toBeInTheDocument();
    });
  });
});
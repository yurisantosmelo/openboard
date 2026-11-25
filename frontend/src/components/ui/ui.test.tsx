import { render, screen } from '@testing-library/react';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from './alert';
import { Badge } from './badge';
import { Button } from './button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from './card';
import { Field } from './field';

describe('shadcn/ui components', () => {
  it('renders Button as button or child via Slot', () => {
    render(
      <div>
        <Button>Save</Button>
        <Button asChild variant="link">
          <a href="/home">Go home</a>
        </Button>
      </div>,
    );
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'button');
    expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute('href', '/home');
  });

  it('wires Field validation errors to aria-invalid and aria-describedby', () => {
    render(<Field label="Email" error="Invalid email" />);
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Invalid email');
  });

  it('renders Card, Badge and Alert with Lucide icons', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
          <Badge>Active</Badge>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertDescription role="alert">Something failed</AlertDescription>
          </Alert>
        </CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>,
    );
    expect(screen.getByRole('heading', { name: 'Summary' })).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Something failed');
    expect(screen.getByText('Footer')).toBeInTheDocument();
  });
});

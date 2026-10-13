import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RecifyLogo } from '@/components/recify/RecifyLogo';

describe('RecifyLogo', () => {
  it('keeps the brand name out of automatic translation', () => {
    render(<RecifyLogo />);

    const name = screen.getByText('Recify');
    expect(name).toHaveAttribute('translate', 'no');
    expect(name).toHaveClass('notranslate');

    const logo = screen.getByRole('img', { name: 'Recify Logo' });
    expect(logo).toHaveAttribute('translate', 'no');
    expect(logo).toHaveClass('notranslate');
  });
});

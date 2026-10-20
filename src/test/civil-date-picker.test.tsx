import { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CivilDatePicker } from '@/components/recify/CivilDatePicker';

afterEach(cleanup);

function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <CivilDatePicker id="fecha" label="Desde" value={value} onChange={setValue} />
  );
}

describe('CivilDatePicker', () => {
  it('shows DD/MM/AAAA and keeps the chosen civil day', async () => {
    render(<Harness initial="2026-08-10" />);
    expect(screen.getByLabelText('Desde')).toHaveTextContent('10/08/2026');

    fireEvent.click(screen.getByLabelText('Desde'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('gridcell', { name: '15' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Desde')).toHaveTextContent('15/08/2026');
  });

  it('moves between months and years from the caption', async () => {
    render(<Harness initial="2026-08-10" />);
    fireEvent.click(screen.getByLabelText('Desde'));
    const dialog = await screen.findByRole('dialog');
    const [monthSelect, yearSelect] = within(dialog).getAllByRole('combobox');

    fireEvent.change(yearSelect, { target: { value: '2025' } });
    fireEvent.change(monthSelect, { target: { value: '0' } });
    fireEvent.click(within(dialog).getByRole('gridcell', { name: '3' }));

    expect(screen.getByLabelText('Desde')).toHaveTextContent('03/01/2025');
  });

  it('opens with the keyboard and clears a selected date', async () => {
    render(<Harness initial="2026-08-10" />);
    const trigger = screen.getByLabelText('Desde');
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'Enter' });
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Borrar fecha' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Desde')).toHaveTextContent('DD/MM/AAAA');
  });

  it('shows the empty placeholder for an invalid value', () => {
    render(<Harness initial="2026-02-31" />);
    expect(screen.getByLabelText('Desde')).toHaveTextContent('DD/MM/AAAA');
  });

  it('uses the full width class so the field can wrap on a narrow row', () => {
    render(<Harness />);
    expect(screen.getByLabelText('Desde').className).toContain('w-full');
    expect(screen.getByLabelText('Desde').className).toContain('sm:w-[9.5rem]');
  });
});

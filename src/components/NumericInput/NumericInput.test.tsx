import { h } from 'preact';
import { UseFormRegisterReturn } from 'react-hook-form';
import { render } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { NumericInput } from '.';

const mockRegister: UseFormRegisterReturn = {
  name: 'testInput',
  onChange: jest.fn(),
  onBlur: jest.fn(),
  ref: jest.fn(),
};

describe('NumericInput Component', () => {
  it('should render the component', () => {
    const { getByPlaceholderText } = render(<NumericInput register={mockRegister} />);
    const inputElement = getByPlaceholderText('0.0');
    expect(inputElement).toBeInTheDocument();
  });

  it('should allow numeric input', async () => {
    const { getByPlaceholderText } = render(<NumericInput register={mockRegister} />);
    const inputElement = getByPlaceholderText('0.0') as HTMLInputElement;

    await userEvent.type(inputElement, '1234567890');
    expect(inputElement.value).toBe('1234567890');
  });

  it('should prevent non-numeric input', async () => {
    const { getByPlaceholderText } = render(<NumericInput register={mockRegister} />);
    const inputElement = getByPlaceholderText('0.0') as HTMLInputElement;

    await userEvent.type(inputElement, 'qwertyuiopasdfghjklzxcvbnm');
    expect(inputElement.value).toBe('');
  });

  it('should prevent multiple decimal points', async () => {
    const { getByPlaceholderText } = render(<NumericInput register={mockRegister} />);
    const inputElement = getByPlaceholderText('0.0') as HTMLInputElement;

    await userEvent.type(inputElement, '1.1.1,2.3,4');
    expect(inputElement.value).toBe('1.11234');
  });

  it('should replace comma with period', async () => {
    const { getByPlaceholderText } = render(<NumericInput register={mockRegister} />);
    const inputElement = getByPlaceholderText('0.0') as HTMLInputElement;

    await userEvent.type(inputElement, '1,1');
    expect(inputElement.value).toBe('1.1');
  });

  it('should work with readOnly prop', () => {
    const { getByPlaceholderText } = render(<NumericInput register={mockRegister} readOnly={true} />);
    const inputElement = getByPlaceholderText('0.0') as HTMLInputElement;

    expect(inputElement).toHaveAttribute('readOnly');
  });

  it('should apply additional styles', () => {
    const { getByPlaceholderText } = render(<NumericInput register={mockRegister} additionalStyle="extra-style" />);
    const inputElement = getByPlaceholderText('0.0');

    expect(inputElement).toHaveClass('extra-style');
  });

  it('should handle leading zeros correctly', async () => {
    const { getByPlaceholderText } = render(<NumericInput register={mockRegister} />);
    const inputElement = getByPlaceholderText('0.0') as HTMLInputElement;

    await userEvent.type(inputElement, '007');
    expect(inputElement.value).toBe('007');
  });

  it('should allow backspace and delete', async () => {
    const { getByPlaceholderText } = render(<NumericInput register={mockRegister} />);
    const inputElement = getByPlaceholderText('0.0') as HTMLInputElement;

    await userEvent.type(inputElement, '123');
    await userEvent.type(inputElement, '{backspace}');
    expect(inputElement.value).toBe('12');

    await userEvent.type(inputElement, '{delete}');
    expect(inputElement.value).toBe('12');
  });

  it('should not allow negative numbers', async () => {
    const { getByPlaceholderText } = render(<NumericInput register={mockRegister} />);
    const inputElement = getByPlaceholderText('0.0') as HTMLInputElement;

    await userEvent.type(inputElement, '-123');
    expect(inputElement.value).toBe('123');
  });

  it('should not allow more decimals than maxDecimals', async () => {
    const { getByPlaceholderText } = render(<NumericInput register={mockRegister} maxDecimals={2} />);
    const inputElement = getByPlaceholderText('0.0') as HTMLInputElement;

    await userEvent.type(inputElement, '123.45479187249871298774985');
    expect(inputElement.value).toBe('123.45');
  });

  it('should not allow more decimals than default maxDecimals', async () => {
    const { getByPlaceholderText } = render(<NumericInput register={mockRegister} />);
    const inputElement = getByPlaceholderText('0.0') as HTMLInputElement;

    await userEvent.type(inputElement, '123.4567890123456789abcgdehyu0123456.2746472.93.2.7.3.5.3');
    expect(inputElement.value).toBe('123.456789012343');
  });
});

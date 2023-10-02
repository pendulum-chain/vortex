import { Button } from 'react-daisyui';
import { ButtonProps } from 'react-daisyui/dist/Button/Button';

export const CloseButton = (props: ButtonProps) => (
  <Button
    color="ghost"
    size="sm"
    shape="circle"
    className="absolute right-4 top-4 text-xl font-thin !leading-5 w-[2.25rem] h-[2.25rem]"
    style={{ color: 'var(--secondary)' }}
    type="button"
    {...props}
  >
    <span className="text-[1.25em]">⨯</span>
  </Button>
);

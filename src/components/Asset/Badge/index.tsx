import pendulumIcon from '../../../assets/pendulum-icon.svg';
const sizes = {
  sm: 'h-[1em]',
  md: 'h-[1.5em]',
  lg: 'h-[2em]',
  xl: 'h-[3em]',
};

export type BadgeProps = {
  size?: keyof typeof sizes;
  className?: string;
  children?: ReactNode;
};

const AssetBadge = ({ size = 'md', className, children }: BadgeProps): JSX.Element | null => {
  return (
    <span
      className={`rounded-full bg-neutral-200 flex items-center justify-between font-semibold min-w-[70px] pr-[.5em] ${
        sizes[size]
      } ${className || ''}`}
    >
      <span className="rounded-full grow shrink-0 bg-neutral-300 h-full mr-1 p-[.1em]">
        <img src={pendulumIcon} alt="Pendulum" className="h-full w-auto" width={42} height={42} />
      </span>
      {children}
    </span>
  );
};
export default AssetBadge;

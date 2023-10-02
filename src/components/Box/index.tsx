import { ComponentChildren } from 'preact';
import './styles.css';

type Props = {
  title?: string;
  subTitle?: string;
  children?: ComponentChildren;
};

const Box = ({ title, subTitle, children }: Props) => {
  return (
    <div className="box">
      <div className="box-inner">
        {title && <h1>{title}</h1>}
        {subTitle && <h2>{subTitle}</h2>}
        {children}
      </div>
    </div>
  );
};

export default Box;

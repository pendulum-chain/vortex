import { FC } from 'preact/compat';

interface Sep24Props {
  sep24Url: string;
}

const Sep24: FC<Sep24Props> = ({ sep24Url }) => {
  return (
    <div>
      <div className="iframe-container">
        {sep24Url && (
          <a href={sep24Url} target="_blank" rel="noreferrer">
            <button className="w-full mt-5 text-white bg-blue-700 btn rounded-xl" type="button">
              Enter bank details (New window).
            </button>
          </a>
        )}
      </div>
    </div>
  );
};

export default Sep24;

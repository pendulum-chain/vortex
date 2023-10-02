import BannerImage from '../../assets/banner-spacewalk-4x.png';

function Banner() {
  return (
    <div className="card card-compact sm:w-2/3 banner rounded-md mb-6 bg-base-200">
      <a target="blank" href="https://pendulumchain.org/spacewalk">
        <div className="card-body">
          <div className="card-title block">
            <h2 className={'float-left'}>Promo</h2>
            <h2 className={'float-right'}>Join now</h2>
          </div>
          <figure>
            <img src={BannerImage} />
          </figure>
        </div>
      </a>
    </div>
  );
}

export default Banner;

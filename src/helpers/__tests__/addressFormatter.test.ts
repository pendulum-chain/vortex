import { expect } from 'expect';
import { getAddressForFormat } from '../addressFormatter';

describe('addressFormatter', () => {
  test('should return formatted address', () => {
    expect(getAddressForFormat('5Gv8YYFu8H1btvmrJy9FjjAWfb99wrhV3uhPFoNEr918utyR', '57')).toBe(
      '6mj2RRNwte8WEoqotxLcQF9tMsHZmc9Ht21MV41knxvT8siS',
    );
  });
});

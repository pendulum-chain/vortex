import { Request, Response, NextFunction } from 'express';
import { fundEphemeralAccount, sendStatusWithPk } from '../services/pendulum/pendulum.service';

interface FundEphemeralRequest {
  ephemeralAddress: string;
}

type ApiResponse<T> =
  | {
      status: 'success';
      data: T;
    }
  | {
      error: string;
      details?: string;
    };

export const fundEphemeralAccountController = async (
  req: Request<{}, {}, FundEphemeralRequest>,
  res: Response<ApiResponse<void>>,
) => {
  const { ephemeralAddress } = req.body;

  if (!ephemeralAddress) {
    res.status(400).send({ error: 'Invalid request parameters' });
    return;
  }

  try {
    const result = await fundEphemeralAccount(ephemeralAddress);
    if (result) {
      res.json({ status: 'success', data: undefined });
      return;
    } else {
      res.status(500).send({ error: 'Funding error' });
      return;
    }
  } catch (error) {
    console.error('Error funding ephemeral account:', error);
    res.status(500).send({ error: 'Internal Server Error' });
    return;
  }
};

export const sendStatusWithPkController = async (_req: Request, res: Response, _next: NextFunction) => {
  try {
    const result = await sendStatusWithPk();
    res.json(result);
    return;
  } catch (err) {
    const error = err as Error;
    console.error('Server error:', error);
    res.status(500).json({
      error: 'Server error',
      details: error.message,
    });
    return;
  }
};

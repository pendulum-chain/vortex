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
    return res.status(400).send({ error: 'Invalid request parameters' });
  }

  try {
    const result = await fundEphemeralAccount(ephemeralAddress);
    if (result) {
      return res.json({ status: 'success', data: undefined });
    } else {
      return res.status(500).send({ error: 'Funding error' });
    }
  } catch (error) {
    console.error('Error funding ephemeral account:', error);
    return res.status(500).send({ error: 'Internal Server Error' });
  }
};

export const sendStatusWithPkController = async (_req: Request, res: Response, _next: NextFunction) => {
  try {
    const result = await sendStatusWithPk();
    return res.json(result);
  } catch (err) {
    const error = err as Error;
    console.error('Server error:', error);
    return res.status(500).json({
      error: 'Server error',
      details: error.message,
    });
  }
};

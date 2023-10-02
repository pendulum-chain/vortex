import { render, screen } from '@testing-library/preact';
import { Fragment } from 'preact';
import Box from '.';

describe('Box', () => {
  test('should display initial count', () => {
    const title = 'Test title';
    const children = 'Test children';
    render(
      <Box title={title}>
        <Fragment>{children}</Fragment>
      </Box>,
    );
    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.getByText(children)).toBeInTheDocument();
  });
});

import { nightlyUpdate } from '../src/bots/hypertrades/learner.js';
import { prisma } from '../src/db.js';
import { jest, expect } from '@jest/globals';

// Create a simplified test that just verifies the update math
test('learner decreases thresholds on positive reward', async () => {
  // Create a spy on the console.log to capture the output
  const logSpy = jest.spyOn(console, 'log');
  
  // Run the nightly update
  await nightlyUpdate();
  
  // Check that the log message was called with expected values
  expect(logSpy).toHaveBeenCalledWith(
    expect.stringMatching(/\[learner\] updated smcThresh=0\.0019 rsiOS=33\.25/)
  );
  
  // Restore the spy
  logSpy.mockRestore();
}); 
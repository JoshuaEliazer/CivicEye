import Complaint from '../models/Complaint.js';

/**
 * Generates a unique human-readable complaint identifier.
 * Format: CE-YYYY-NNNNNN (e.g. CE-2026-000001)
 *
 * @returns {Promise<string>} Unique complaint ID
 */
export const generateComplaintId = async () => {
  const year = new Date().getFullYear();

  // Determine current count to establish sequential baseline
  const count = await Complaint.countDocuments();
  let sequence = count + 1;

  let candidateId = `CE-${year}-${String(sequence).padStart(6, '0')}`;

  // Check if candidate ID already exists (in case of deletes or concurrent writes)
  let exists = await Complaint.findOne({ complaintId: candidateId });
  while (exists) {
    sequence += 1;
    candidateId = `CE-${year}-${String(sequence).padStart(6, '0')}`;
    exists = await Complaint.findOne({ complaintId: candidateId });
  }

  return candidateId;
};

export default {
  generateComplaintId,
};

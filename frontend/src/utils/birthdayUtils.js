/**
 * Check if today is the person's birthday
 * @param {string|Date} dateOfBirth - Date of birth (YYYY-MM-DD or Date object)
 * @returns {boolean} - True if today is their birthday
 */
export const isBirthday = (dateOfBirth) => {
  if (!dateOfBirth) return false;
  
  try {
    const dob = new Date(dateOfBirth);
    const today = new Date();
    
    return (
      dob.getMonth() === today.getMonth() &&
      dob.getDate() === today.getDate()
    );
  } catch (error) {
    console.error('Error checking birthday:', error);
    return false;
  }
};

/**
 * Check if today is the worker's birthday based on ID number
 * South African ID format: YYMMDD... (first 6 digits are birth date)
 * @param {string} idNumber - ID number in format YYMMDDXXXXXX
 * @returns {boolean} - True if today is their birthday
 */
export const isBirthdayFromId = (idNumber) => {
  if (!idNumber || typeof idNumber !== 'string' || idNumber.length < 6) return false;
  
  try {
    // Extract YYMMDD from ID number
    const yy = idNumber.substring(0, 2);
    const mm = idNumber.substring(2, 4);
    const dd = idNumber.substring(4, 6);
    
    // Parse month and day
    const month = parseInt(mm, 10) - 1; // JavaScript months are 0-indexed
    const day = parseInt(dd, 10);
    
    // Validate month and day
    if (month < 0 || month > 11 || day < 1 || day > 31) {
      return false;
    }
    
    const today = new Date();
    
    return (
      today.getMonth() === month &&
      today.getDate() === day
    );
  } catch (error) {
    console.error('Error checking birthday from ID:', error);
    return false;
  }
};

/**
 * Get age from date of birth
 * @param {string|Date} dateOfBirth - Date of birth
 * @returns {number|null} - Age in years
 */
export const getAge = (dateOfBirth) => {
  if (!dateOfBirth) return null;
  
  try {
    const dob = new Date(dateOfBirth);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    
    return age;
  } catch (error) {
    console.error('Error calculating age:', error);
    return null;
  }
};

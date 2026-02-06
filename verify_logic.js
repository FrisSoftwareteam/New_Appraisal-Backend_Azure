const parseExcelDate = (value) => {
  if (!value) return undefined;
  if (typeof value === 'number') {
    return new Date(Math.round((value - 25569) * 86400 * 1000));
  }
  const parsed = new Date(value);
  if (!isNaN(parsed.getTime())) return parsed;
  if (typeof value === 'string') {
    const parts = value.split(/[/-]/);
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      const d = new Date(year, month, day);
      if (!isNaN(d.getTime())) return d;
    }
  }
  return undefined;
};

const testHeaders = ["date of last promotion", "Date Of Last Promotion", "DateOfLastPromotion", "last promotion date"];
const testValues = ["01/05/2023", "2023-05-01", 45047]; 

testHeaders.forEach(header => {
    const lowerKey = header.toLowerCase().trim();
    const match = (lowerKey === 'date of last promotion' || lowerKey === 'dateoflastpromotion' || lowerKey === 'last promotion date');
    console.log(`Header: "${header}" -> Match: ${match}`);
});

testValues.forEach(val => {
    const parsed = parseExcelDate(val);
    console.log(`Value: "${val}" -> Parsed: ${parsed ? parsed.toISOString() : 'NULL'}`);
});

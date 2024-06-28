function getRandomColor() {
  const letters = "89ABCDEF"; // Using higher values to ensure lighter colors
  let color = "#";
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * letters.length)];
  }
  return color;
}
function colors(value, opacity) {
  return value.map((day_chg) =>
    day_chg < 0
      ? `rgba(255, 110, 100, ${opacity})`
      : `rgba(0, 125, 10, ${opacity})`
  );
}

module.exports = {
  getRandomColor: getRandomColor,
  colors: colors
};
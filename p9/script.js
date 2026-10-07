// let price = [12, 5, 45, 78, 9]
// const prices2 = [120, 23, 45, 60, 55]
// console.log(prices2[2])
//
// prices2[1] = 30;
//
// console.log(prices2)
// console.log(price.length)
//
//
// let sum = 0;
// for (let i = 0; i < price.length; i++){
//     sum += price[i];
//     if(price[i] % 2 === 0 ) {
//         console.log(price[i])
//     }
// }
//
// console.log(sum)

//
// function findOverLimitPrices(prices, limit) {
//     let counter = 0;
//     for (let i = 0; i < prices.length; i++) {
//         if (prices[i] > limit) {
//             counter++;
//         }
//     }
//     return counter;
// }
//
// let prices = [50, 45, 30, 100, 55]
// let limit = 50;
//
// console.log(findOverLimitPrices(prices, limit));

//______________________________________________________________#1

// function arrayAverage(array) {
//     let sum = 0;
//     for (let i = 0; i < array.length; i++) {
//         sum += array[i];
//     }
//     return sum / array.length;
// }

//______________________________________________________________#2

// function addToArrayAndSumNumbers() {
//     let array = [];
//     let quantityOfNumbers = +prompt("Enter quantity of numbers");
//     let sum = 0;
//
//     for (let i = 0; i < quantityOfNumbers; i++) {
//         let number = +prompt("Enter number");
//         array[i] = number;
//         sum += number;
//     }
//
//     console.log(array);
//     console.log(`Sum of numbers ${sum}`);
// }
//
// addToArrayAndSumNumbers();

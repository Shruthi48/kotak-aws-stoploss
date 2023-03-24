// import axios from 'axios';
// import dotenv from 'dotenv';
var axios = require('axios');
var dotenv = require('dotenv');

dotenv.config();

const CONSUMER_KEY = process.env.CONSUMER_KEY;
let SESSION_TOKEN = '';
const AUTH_TOKEN = process.env.AUTH_TOKEN;
const LOSS_LIMIT = process.env.LOSS_LIMIT;
let shouldWait = false;

const getLossForEachTrade = (data) => {
    return data.map(item => ((item.averageStockPrice - item.lastPrice) * item.netTrdQtyLot) * -1);
}

const getSumLossForEachTrade = (lossForEachTrade) => {
   return lossForEachTrade.reduce((acc,curr) => acc+curr, 0);
}

const checkLossLimit = (sumValue, orders) => {
  if(sumValue <= LOSS_LIMIT) {
      /* square off positions if limit is reached */
    shouldWait = true;
    squareOffPositions(orders)
  }
}

const sendMsg = (msg) => {
   axios({url: `https://api.telegram.org/bot${process.env.TELE_BOT_TOKEN}/sendMessage?chat_id=${process.env.TELE_CHAT_ID}&text=${msg}`})
}

const breakQuantityAndPlaceOrder = (order) => {
    let quantity = Math.abs(order.netTrdQtyLot);
    let maxLimit = 900;

    while( quantity != 0) {
        if(quantity > maxLimit) {
            placeOrderWithDelay(order,900,250);
            quantity = Math.abs(order.netTrdQtyLot) - 900
          } else {
            placeOrderWithDelay(order,quantity,250);
            quantity = 0;
            shouldWait = false;
        }
    }
}

const placeOrderWithDelay = (order, quantity, delay) => {
    setTimeout(() => {
        placeOrder(order, quantity);
    },delay)
}

const placeOrder = (order, quantity) => {
   const data = JSON.stringify({
    "instrumentToken": order.instrumentToken,
    "transactionType": "BUY",
    "quantity": quantity,
    "price": 0,
    "validity": "GFD",
    "variety": "REGULAR",
    "disclosedQuantity": 0,
    "triggerPrice": 0,
    "tag": "string"
  });

  const config = {
    method: 'post',
    url: 'https://ctradeapi.kotaksecurities.com/apim/orders/1.0/order/normal',
    headers: {
      'consumerKey': CONSUMER_KEY,
      'sessionToken': SESSION_TOKEN,
      'Content-Type': 'application/json',
      'Authorization': AUTH_TOKEN
    },
    data : data
  };

  axios(config).then(function (response) {
    console.log(JSON.stringify(response.data));
  }).catch(function (error) {
    console.log(error);
  }
  )
}

const squareOffPositions = (orders) => {
   orders.forEach(order => {
    breakQuantityAndPlaceOrder(order)
   })
}

const getPositions = () => {
    const config = {
        method: 'get',
        headers: {
          'consumerKey': CONSUMER_KEY,
          'sessionToken': SESSION_TOKEN,
          'Authorization': AUTH_TOKEN
        }
    };

    axios(config).then(function (response) {
       const responseData = response.data['Success'];
       console.log('ticks');
       const maxQuantityNonZero = responseData.filter(item => item.netTrdQtyLot !=0);
       const lossForEachTrade = getLossForEachTrade(maxQuantityNonZero);
       const sumLossForEachTrade = getSumLossForEachTrade(lossForEachTrade);
       checkLossLimit(sumLossForEachTrade,maxQuantityNonZero);
    }).catch(function (error) {
       console.log(error);
       shouldWait = false;
    });
}

const init = async () => {

   let loginResponse = await login();
   // console.log('loginResponse', loginResponse);
   const ott = loginResponse.Success.oneTimeToken;
   console.log('ott', ott);
   let sessionTokenResponse = await getSessionToken(ott);
   SESSION_TOKEN = sessionTokenResponse && sessionTokenResponse.success.sessionToken;
   console.log('sessionToken', SESSION_TOKEN);

   sendMsg('hello from ec2 code');

   if(!shouldWait) {
    getPositionInIntervals(5000);
   }
   
};

const getPositionInIntervals = (delay) => {
    setInterval(async () => {
        await getPositions();
    }, delay)
}

const getSessionToken = (ott) => {
    var data = JSON.stringify({
        "userid": process.env.USER_ID
      });

      var config = {
        method: 'post',
        url: 'https://ctradeapi.kotaksecurities.com/apim/session/1.0/session/2FA/oneTimeToken',
        headers: {
          'oneTimeToken': ott,
          'appId': process.env.APP_ID,
          'consumerKey': process.env.CONSUMER_KEY,
          'ip': process.env.IP,
          'Content-Type': 'application/json',
          'Authorization': AUTH_TOKEN
        },
        data : data
      };

      return axios(config).then(function (response) {
        return response.data;
      }).catch(function (error) {
        console.log(error);
        shouldWait = false;
      });
}

const login = () => {
    var data = JSON.stringify({
        "userid": process.env.USER_ID,
        "password": process.env.PSWD
      });

      var config = {
        method: 'post',
        url: 'https://ctradeapi.kotaksecurities.com/apim/session/1.0/session/login/userid',
        headers: {
          'consumerKey': CONSUMER_KEY,
          'ip': process.env.IP,
          'appId': 'DefaultApplication',
          'Content-Type': 'application/json',
          'Authorization': AUTH_TOKEN
        },
        data : data
      };

      return axios(config).then(function (response) {
        return response.data
      }).catch(function (error) {
        console.log(error);
      });
}

init();

const doWhilst = require('async/doWhilst');
const waterfall = require('async/waterfall');
const moment = require('moment');
const prompt = require('prompt');
const request = require('request');

const dotenv = require('dotenv').config();

const slackApi = 'https://slack.com/api';

prompt.start();

let page = 1;
let pages = null;
let members = [];
let sizeTotal = 0;
const aMonthAgo = moment().subtract(30, 'days');

const fileIdsToDelete = [];
let sizeTotalToDelete = 0;

prompt.get(['token'], (err, result) => {
  if (err) {
    console.log(err);
    return;
  }

  const token = result.token.length > 0 ? result.token : process.env.TOKEN;
  if (!token) {
    console.error('No token!');
    return;
  }

  waterfall(
    [
      callback => {
        console.log(`Requesting users' list...`);
        request(`${slackApi}/users.list?token=${token}`, (err, res, body) => {
          body = JSON.parse(body);
          body.members.forEach(member => {
            members.push({
              id: member.id,
              name: member.real_name || member.name,
              size: 0,
              count: 0,
              privateSize: 0,
              privateCount: 0
            });
          });
          callback(null);
        });
      },
      callback => {
        doWhilst(
          callbackWhilst => {
            console.log(`Requesting files' list (page ${page})...`);
            request(
              `${slackApi}/files.list?token=${token}&page=${page}`,
              (err, res, body) => {
                body = JSON.parse(body);

                // Set pages first.
                if (pages === null) {
                  pages = body.paging.pages;
                }

                body.files.forEach((file, index) => {
                  const member = getMemberById(file.user);
                  const createdAt = moment(file.created, 'X');

                  sizeTotal += file.size;

                  member.size += file.size;
                  member.count++;

                  if (file.is_public === false) {
                    member.privateSize += file.size;
                    member.privateCount++;
                  }

                  if (createdAt.isBefore(aMonthAgo)) {
                    fileIdsToDelete.push(file.id);
                    sizeTotalToDelete += file.size;
                  }
                });
                page++;
                callbackWhilst(null);
              }
            );
          },
          () => {
            return page <= pages;
          },
          err => {
            callback(null);
          }
        );
      }
    ],
    err => {
      if (err) {
        console.log('Error', err);
        return;
      }

      members.sort((a, b) => {
        return b.size - a.size;
      });
      console.log(
        members.map(member => {
          if (member.size > 0) {
            delete member.id;
            member.size = bytesToMb(member.size);
            member.privateSize = bytesToMb(member.privateSize);
            return member;
          } else {
            return null;
          }
        })
      );
      console.log(`Current total file sizes: ${bytesToMb(sizeTotal)} MB`);
      console.log(`Total ${bytesToMb(sizeTotalToDelete)} MB to be deleted...`);

      prompt.get(
        [
          {
            name: 'delete',
            description: 'Delete 30-or-more-day-old files? (Y, n)'
          }
        ],
        (err, result) => {
          if (result.delete === 'Y') {
            fileIdsToDelete.forEach((fileId, index) => {
              request.post(
                `${slackApi}/files.delete?token=${token}&file=${fileId}`,
                (err, res, body) => {
                  if (res.statusCode === 200) {
                    console.log(`${fileId} successfully deleted.`);
                  } else {
                    console.log(`Error: ${fileId} not deleted.`);
                  }
                }
              );
            });
          }
        }
      );
    }
  );
});

const getMemberById = id => {
  const membersFiltered = members.filter(member => member.id == id);
  return membersFiltered.length > 0 ? membersFiltered[0] : null;
};

const bytesToMb = bytes => {
  return parseFloat((bytes / (1024 * 1024)).toFixed(2));
};

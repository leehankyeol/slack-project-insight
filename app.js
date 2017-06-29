const doWhilst = require('async/doWhilst');
const waterfall = require('async/waterfall');
const prompt = require('prompt');
const timestamp = require('unix-timestamp');
const request = require('request');

const slackApi = 'https://slack.com/api';

prompt.start();

let page = 1;
let pages = null;
let members = [];
let sizeTotal = 0;

prompt.get(['token'], (err, result) => {
  if (err) {
    console.log(err);
    return;
  }

  const token = result.token;
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

                body.files.forEach(file => {
                  const member = getMemberById(file.user);

                  sizeTotal += file.size;

                  member.size += file.size;
                  member.count++;

                  if (file.is_public === false) {
                    member.privateSize += file.size;
                    member.privateCount++;
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
            member.size = (member.size / (1024 * 1024)).toFixed(2);
            member.privateSize = (member.privateSize / (1024 * 1024)).toFixed(
              2
            );
            return member;
          } else {
            return null;
          }
        })
      );
      console.log((sizeTotal / (1024 * 1024)).toFixed(2));
    }
  );
});

const getMemberById = id => {
  const membersFiltered = members.filter(member => member.id == id);
  return membersFiltered.length > 0 ? membersFiltered[0] : null;
};
